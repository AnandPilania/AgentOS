import * as fs from 'fs/promises'
import { Dirent } from 'fs'
import path from 'path'
import { EventEmitter } from 'eventemitter3'
import { logger } from '../utils/logger'
import type { SettingsManager } from './SettingsManager'

export interface IndexStats {
    workspaceId: string
    totalFiles: number
    totalChunks: number
    indexedAt: string
    provider: 'openai-embeddings' | 'ollama-embeddings' | 'tfidf'
}

interface Chunk {
    id: string
    workspaceId: string
    filePath: string
    content: string
    startLine: number
    endLine: number
}

// ─── TF-IDF (always available) ────────────────────────────────────────────
class TFIDFIndex {
    private docs: Array<{ id: string; terms: Map<string, number>; chunk: Chunk }> = []

    add(c: Chunk): void {
        this.docs.push({ id: c.id, terms: this.tokenize(c.content), chunk: c })
    }

    search(query: string, k: number): Array<{ chunk: Chunk; score: number }> {
        const qTerms = this.tokenize(query)
        const scored: Array<{ chunk: Chunk; score: number }> = []
        for (const doc of this.docs) {
            let s = 0
            for (const [t, qf] of qTerms) {
                const df = doc.terms.get(t) ?? 0
                if (df > 0) s += qf * Math.log(1 + df)
            }
            if (s > 0) scored.push({ chunk: doc.chunk, score: s })
        }
        return scored.sort((a, b) => b.score - a.score).slice(0, k)
    }

    private tokenize(text: string): Map<string, number> {
        const m = new Map<string, number>()
        for (const w of text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/)) {
            if (w.length > 2) m.set(w, (m.get(w) ?? 0) + 1)
        }
        return m
    }

    get size(): number { return this.docs.length }
    clear(): void { this.docs = [] }
}

// ─── WorkspaceContextManager ──────────────────────────────────────────────
export class WorkspaceContextManager extends EventEmitter {
    private tfidf = new Map<string, TFIDFIndex>()
    private stats = new Map<string, IndexStats>()
    // LanceDB is loaded lazily; typed as unknown so the class compiles without
    // @lancedb/lancedb installed.
    private lanceConn?: unknown
    private lanceTables = new Map<string, unknown>()

    // Tuning
    private readonly CHUNK_LINES = 60
    private readonly CHUNK_OVERLAP = 10
    private readonly TOP_K = 8
    private readonly MAX_CTX_CHARS = 6000

    private readonly SKIP_DIRS = new Set([
        'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
        'coverage', '.turbo', '.cache', '.agentos-worktrees',
    ])
    private readonly INCLUDE_EXT = new Set([
        '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.cpp',
        '.c', '.h', '.cs', '.rb', '.php', '.swift', '.kt', '.vue', '.svelte',
        '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.sh', '.sql', '.env.example',
    ])

    constructor(
        private settings: SettingsManager,
        private userDataPath: string,
    ) {
        super()
    }

    // ─── Public API ───────────────────────────────────────────────────────────
    async indexWorkspace(workspaceId: string, workspacePath: string): Promise<IndexStats> {
        logger.info(`[Context] Indexing workspace ${workspaceId}`)
        this.emit('index:start', { workspaceId })

        const chunks = await this.collectChunks(workspacePath, workspaceId)

        // Rebuild TF-IDF regardless (fast, always works)
        const tfidf = new TFIDFIndex()
        for (const c of chunks) tfidf.add(c)
        this.tfidf.set(workspaceId, tfidf)

        // Try vector embeddings
        let provider: IndexStats['provider'] = 'tfidf'
        try {
            provider = await this.buildVectorIndex(workspaceId, chunks)
        } catch (e) {
            logger.warn(`[Context] Vector index failed, using TF-IDF: ${e}`)
        }

        const s: IndexStats = {
            workspaceId,
            totalFiles: new Set(chunks.map(c => c.filePath)).size,
            totalChunks: chunks.length,
            indexedAt: new Date().toISOString(),
            provider,
        }
        this.stats.set(workspaceId, s)
        this.emit('index:done', s)
        logger.info(`[Context] Done: ${s.totalFiles} files, ${s.totalChunks} chunks, provider=${provider}`)
        return s
    }

    async search(workspaceId: string, query: string, topK?: number): Promise<Array<{ chunk: Chunk; score: number }>> {
        const k = topK ?? this.TOP_K

        const table = this.lanceTables.get(workspaceId)
        if (table) {
            try { return await this.vectorSearch(table, query, workspaceId, k) }
            catch (e) { logger.warn(`[Context] Vector search failed: ${e}`) }
        }

        return this.tfidf.get(workspaceId)?.search(query, k) ?? []
    }

    async getContextSummary(workspaceId: string, query: string): Promise<string> {
        if (!this.tfidf.has(workspaceId)) {
            return '(workspace not yet indexed — context unavailable)'
        }
        const results = await this.search(workspaceId, query)
        if (!results.length) return '(no relevant context found for this query)'

        let total = 0
        const parts: string[] = []
        for (const { chunk, score } of results) {
            const block = `--- ${chunk.filePath}:${chunk.startLine}-${chunk.endLine} (score:${score.toFixed(2)}) ---\n${chunk.content}`
            if (total + block.length > this.MAX_CTX_CHARS) break
            parts.push(block)
            total += block.length
        }
        return parts.join('\n\n')
    }

    getStats(workspaceId: string): IndexStats | undefined {
        return this.stats.get(workspaceId)
    }

    clearIndex(workspaceId: string): void {
        this.tfidf.get(workspaceId)?.clear()
        this.tfidf.delete(workspaceId)
        this.lanceTables.delete(workspaceId)
        this.stats.delete(workspaceId)
    }

    // ─── File collection ──────────────────────────────────────────────────────
    private async collectChunks(base: string, wsId: string): Promise<Chunk[]> {
        const files = await this.walk(base)
        const chunks: Chunk[] = []
        for (const fp of files) {
            try {
                const lines = (await fs.readFile(fp, 'utf-8')).split('\n')
                const rel = path.relative(base, fp)
                const step = this.CHUNK_LINES - this.CHUNK_OVERLAP
                for (let i = 0; i < lines.length; i += step) {
                    const end = Math.min(i + this.CHUNK_LINES, lines.length)
                    const content = lines.slice(i, end).join('\n').trim()
                    if (content.length < 30) continue
                    chunks.push({
                        id: `${wsId}:${rel}:${i}`,
                        workspaceId: wsId, filePath: rel,
                        content, startLine: i + 1, endLine: end,
                    })
                }
            } catch { /* skip unreadable */ }
        }
        return chunks
    }

    private async walk(dir: string): Promise<string[]> {
        const out: string[] = []
        let entries: Dirent[]
        try {
            entries = await fs.readdir(dir, { withFileTypes: true })
        } catch {
            return out
        }
        for (const e of entries) {
            if (this.SKIP_DIRS.has(e.name)) continue
            const full = path.join(dir, e.name)
            if (e.isDirectory()) out.push(...await this.walk(full))
            else if (e.isFile() && this.INCLUDE_EXT.has(path.extname(e.name).toLowerCase()))
                out.push(full)
        }
        return out
    }

    // ─── LanceDB + embeddings ─────────────────────────────────────────────────
    private async buildVectorIndex(wsId: string, chunks: Chunk[]): Promise<IndexStats['provider']> {
        // Lazy import — only available if installed
        let ldb: typeof import('@lancedb/lancedb')
        try { ldb = await import('@lancedb/lancedb') }
        catch { return 'tfidf' }

        const embed = this.getEmbedFn()
        if (!embed) return 'tfidf'

        const dbPath = path.join(this.userDataPath, 'lancedb')
        await fs.mkdir(dbPath, { recursive: true })

        if (!this.lanceConn) this.lanceConn = await ldb.connect(dbPath)
        const conn = this.lanceConn as Awaited<ReturnType<typeof ldb.connect>>

        // Build records in batches of 20
        const records: Record<string, unknown>[] = []
        const BATCH = 20
        for (let i = 0; i < chunks.length; i += BATCH) {
            const batch = chunks.slice(i, i + BATCH)
            const vecs = await embed(batch.map(c => c.content.slice(0, 512)))
            batch.forEach((c, j) => records.push({
                id: c.id, workspace_id: c.workspaceId, file_path: c.filePath,
                content: c.content.slice(0, 2000),
                start_line: c.startLine, end_line: c.endLine,
                vector: vecs[j],
            }))
        }

        const tname = `ws_${wsId.replace(/-/g, '_')}`
        try { await conn.dropTable(tname) } catch {
            //
        }
        const table = await conn.createTable(tname, records)
        this.lanceTables.set(wsId, table)

        const providers = this.settings.get().providers
        const hasOpenAI = providers.some(p => p.provider === 'openai' && p.enabled && p.apiKey)
        return hasOpenAI ? 'openai-embeddings' : 'ollama-embeddings'
    }

    private async vectorSearch(
        table: unknown, query: string, wsId: string, k: number,
    ): Promise<Array<{ chunk: Chunk; score: number }>> {
        const embed = this.getEmbedFn()
        if (!embed) return []
        const [vec] = await embed([query.slice(0, 512)])
        const tbl = table as {
            search: (v: number[]) => {
                limit: (n: number) => {
                    filter: (f: string) => { execute: () => Promise<Record<string, unknown>[]> }
                }
            }
        }
        const rows = await tbl.search(vec).limit(k).filter(`workspace_id = '${wsId}'`).execute()
        return rows.map(r => ({
            chunk: {
                id: String(r.id), workspaceId: String(r.workspace_id),
                filePath: String(r.file_path), content: String(r.content),
                startLine: Number(r.start_line), endLine: Number(r.end_line),
            },
            score: 1 - Number(r._distance ?? 0),
        }))
    }

    // Returns an async embed function or null if no provider available
    private getEmbedFn(): ((texts: string[]) => Promise<number[][]>) | null {
        const providers = this.settings.get().providers

        const oai = providers.find(p => p.provider === 'openai' && p.enabled && p.apiKey)
        if (oai?.apiKey) {
            const key = oai.apiKey
            return async (texts) => {
                const r = await fetch('https://api.openai.com/v1/embeddings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
                    body: JSON.stringify({ input: texts, model: 'text-embedding-3-small' }),
                })
                const j = await r.json() as { data: Array<{ embedding: number[] }> }
                return j.data.map(d => d.embedding)
            }
        }

        const ollama = providers.find(p => p.provider === 'ollama' && p.enabled)
        if (ollama) {
            const base = ollama.baseUrl ?? 'http://localhost:11434'
            return async (texts) => {
                const vecs: number[][] = []
                for (const t of texts) {
                    const r = await fetch(`${base}/api/embeddings`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ model: 'nomic-embed-text', prompt: t }),
                    })
                    const j = await r.json() as { embedding: number[] }
                    vecs.push(j.embedding)
                }
                return vecs
            }
        }

        return null
    }
}
