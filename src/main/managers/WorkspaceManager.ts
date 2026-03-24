import { v4 as uuid } from 'uuid'
import simpleGit from 'simple-git'
import fs from 'fs/promises'
import path from 'path'
import type { Workspace, FileDiff, DiffChunk, DiffLine } from '../../shared/types'
import { DatabaseManager } from './DatabaseManager'
import { SettingsManager } from './SettingsManager'
import { logger } from '../utils/logger'

interface FileTreeNode {
    name: string
    path: string
    type: 'file' | 'directory'
    children?: FileTreeNode[]
    size?: number
}

export class WorkspaceManager {
    constructor(
        private db: DatabaseManager,
        private settings: SettingsManager,
    ) { }

    // ─── CRUD ─────────────────────────────────────────────
    async create(data: Partial<Workspace> & { name: string; path: string }): Promise<Workspace> {
        const now = new Date().toISOString()
        const ws: Workspace = {
            id: uuid(),
            name: data.name,
            path: data.path,
            type: data.type ?? 'folder',
            repoUrl: data.repoUrl,
            branch: data.branch,
            baseBranch: data.baseBranch ?? 'main',
            agentIds: [],
            watchEnabled: data.watchEnabled ?? true,
            metadata: data.metadata ?? {},
            createdAt: now,
            updatedAt: now,
        }

        await fs.mkdir(ws.path, { recursive: true })

        this.db.run(
            `INSERT INTO workspaces (id,name,path,type,repo_url,branch,base_branch,watch_enabled,metadata,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [ws.id, ws.name, ws.path, ws.type, ws.repoUrl ?? null, ws.branch ?? null,
            ws.baseBranch ?? null, ws.watchEnabled ? 1 : 0,
            JSON.stringify(ws.metadata), ws.createdAt, ws.updatedAt]
        )

        logger.info(`Workspace created: ${ws.id} at ${ws.path}`)
        return ws
    }

    async delete(id: string): Promise<void> {
        const ws = this.get(id)
        if (!ws) return

        // For git worktrees, remove the worktree properly
        if (ws.type === 'git-worktree' && ws.baseBranch) {
            try {
                const git = simpleGit(path.dirname(ws.path))
                await git.raw(['worktree', 'remove', ws.path, '--force'])
            } catch (e) {
                logger.warn(`Could not remove git worktree: ${e}`)
            }
        }

        this.db.run('DELETE FROM workspaces WHERE id = ?', [id])
        logger.info(`Workspace deleted: ${id}`)
    }

    list(): Workspace[] {
        const rows = this.db.all<Record<string, string>>('SELECT * FROM workspaces ORDER BY created_at DESC')
        return rows.map(r => this.rowToWorkspace(r))
    }

    get(id: string): Workspace | undefined {
        const row = this.db.get<Record<string, string>>('SELECT * FROM workspaces WHERE id = ?', [id])
        return row ? this.rowToWorkspace(row) : undefined
    }

    // ─── Git Worktree ─────────────────────────────────────
    async createWorktree(repoPath: string, branchName: string, wsName: string): Promise<Workspace> {
        const git = simpleGit(repoPath)
        const wtPath = path.join(repoPath, '.agentos-worktrees', branchName)

        await git.raw(['worktree', 'add', '-b', branchName, wtPath])
        logger.info(`Git worktree created: ${wtPath}`)

        return this.create({
            name: wsName,
            path: wtPath,
            type: 'git-worktree',
            branch: branchName,
            baseBranch: await this.getDefaultBranch(repoPath),
        })
    }

    async clone(id: string): Promise<Workspace> {
        const src = this.get(id)
        if (!src) throw new Error(`Workspace ${id} not found`)

        if (src.type === 'git-worktree') {
            return this.createWorktree(
                path.dirname(path.dirname(src.path)),
                `agent-branch-${Date.now()}`,
                `${src.name} (clone)`
            )
        }

        // Folder clone fallback
        const destPath = `${src.path}-clone-${Date.now()}`
        await this.copyDir(src.path, destPath)
        return this.create({ name: `${src.name} (clone)`, path: destPath, type: 'folder' })
    }

    async cloneRepo(url: string, destPath: string, name: string): Promise<Workspace> {
        const git = simpleGit()
        await git.clone(url, destPath)
        logger.info(`Repo cloned: ${url} → ${destPath}`)
        return this.create({ name, path: destPath, type: 'git-worktree', repoUrl: url })
    }

    // ─── Diff ─────────────────────────────────────────────
    async getDiff(id: string): Promise<FileDiff[]> {
        const ws = this.get(id)
        if (!ws) throw new Error(`Workspace ${id} not found`)

        try {
            const git = simpleGit(ws.path)
            const diffSummary = await git.diffSummary(['HEAD'])
            const diffs: FileDiff[] = []

            for (const f of diffSummary.files) {
                const rawDiff = await git.diff(['HEAD', '--', f.file])
                diffs.push({
                    path: f.file,
                    type: 'modified',
                    additions: (f as { insertions: number }).insertions,
                    deletions: (f as { deletions: number }).deletions,
                    chunks: this.parseDiff(rawDiff),
                })
            }

            return diffs
        } catch {
            return []
        }
    }

    private parseDiff(raw: string): DiffChunk[] {
        const chunks: DiffChunk[] = []
        const chunkHeaders = raw.split(/@@[^@@]+@@/)
        const headerMatches = [...raw.matchAll(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/g)]

        chunkHeaders.slice(1).forEach((body, i) => {
            const m = headerMatches[i]
            if (!m) return
            const lines: DiffLine[] = body.split('\n').map(l => ({
                type: l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : 'context',
                content: l.slice(1),
            }))
            chunks.push({
                oldStart: parseInt(m[1]), oldLines: parseInt(m[2] || '1'),
                newStart: parseInt(m[3]), newLines: parseInt(m[4] || '1'),
                lines,
            })
        })
        return chunks
    }

    // ─── Commit ───────────────────────────────────────────
    async commit(id: string, message: string): Promise<void> {
        const ws = this.get(id)
        if (!ws) throw new Error(`Workspace ${id} not found`)
        const git = simpleGit(ws.path)
        await git.add('.')
        await git.commit(message)
        logger.info(`Committed workspace ${id}: ${message}`)
    }

    async getBranches(id: string): Promise<string[]> {
        const ws = this.get(id)
        if (!ws) return []
        const git = simpleGit(ws.path)
        const result = await git.branchLocal()
        return result.all
    }

    async checkout(id: string, branch: string): Promise<void> {
        const ws = this.get(id)
        if (!ws) throw new Error(`Workspace ${id} not found`)
        const git = simpleGit(ws.path)
        await git.checkout(branch)
    }

    // ─── File System ──────────────────────────────────────
    async getFileTree(id: string): Promise<FileTreeNode[]> {
        const ws = this.get(id)
        if (!ws) throw new Error(`Workspace ${id} not found`)
        return this.buildTree(ws.path, ws.path)
    }

    async readFile(id: string, filePath: string): Promise<string> {
        const ws = this.get(id)
        if (!ws) throw new Error(`Workspace ${id} not found`)
        const fullPath = path.join(ws.path, filePath)
        return fs.readFile(fullPath, 'utf-8')
    }

    async writeFile(id: string, filePath: string, content: string): Promise<void> {
        const ws = this.get(id)
        if (!ws) throw new Error(`Workspace ${id} not found`)
        const fullPath = path.join(ws.path, filePath)
        await fs.mkdir(path.dirname(fullPath), { recursive: true })
        await fs.writeFile(fullPath, content, 'utf-8')
    }

    // ─── Helpers ──────────────────────────────────────────
    private async buildTree(basePath: string, currentPath: string, depth = 0): Promise<FileTreeNode[]> {
        if (depth > 6) return []
        const entries = await fs.readdir(currentPath, { withFileTypes: true })
        const nodes: FileTreeNode[] = []
        const ignored = ['node_modules', '.git', '.agentos-worktrees', 'dist', '.next', 'build', '__pycache__']

        for (const entry of entries) {
            if (ignored.includes(entry.name)) continue
            const fullPath = path.join(currentPath, entry.name)
            const relPath = path.relative(basePath, fullPath)

            if (entry.isDirectory()) {
                nodes.push({
                    name: entry.name, path: relPath, type: 'directory',
                    children: await this.buildTree(basePath, fullPath, depth + 1),
                })
            } else {
                const stat = await fs.stat(fullPath).catch(() => null)
                nodes.push({ name: entry.name, path: relPath, type: 'file', size: stat?.size })
            }
        }
        return nodes.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
            return a.name.localeCompare(b.name)
        })
    }

    private async copyDir(src: string, dest: string): Promise<void> {
        await fs.mkdir(dest, { recursive: true })
        const entries = await fs.readdir(src, { withFileTypes: true })
        for (const e of entries) {
            const s = path.join(src, e.name)
            const d = path.join(dest, e.name)
            if (e.isDirectory()) await this.copyDir(s, d)
            else await fs.copyFile(s, d)
        }
    }

    private async getDefaultBranch(repoPath: string): Promise<string> {
        try {
            const git = simpleGit(repoPath)
            const result = await git.revparse(['--abbrev-ref', 'HEAD'])
            return result.trim()
        } catch { return 'main' }
    }

    private rowToWorkspace(r: Record<string, string>): Workspace {
        return {
            id: r.id, name: r.name, path: r.path,
            type: r.type as Workspace['type'],
            repoUrl: r.repo_url ?? undefined,
            branch: r.branch ?? undefined,
            baseBranch: r.base_branch ?? undefined,
            agentIds: [], watchEnabled: !!Number(r.watch_enabled ?? 1),
            metadata: JSON.parse(r.metadata ?? '{}'),
            createdAt: r.created_at, updatedAt: r.updated_at,
        }
    }
}
