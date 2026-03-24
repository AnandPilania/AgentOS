import { v4 as uuid } from 'uuid'
import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'eventemitter3'
import fs from 'fs'
import type { MCPServer, MCPTool, MCPResource } from '../../shared/types'
import { logger } from '../utils/logger'

// JSON-RPC 2.0 types
interface JsonRpcRequest { jsonrpc: '2.0'; id: string | number; method: string; params?: unknown }
interface JsonRpcResponse { jsonrpc: '2.0'; id: string | number; result?: unknown; error?: { code: number; message: string; data?: unknown } }
interface JsonRpcNotification { jsonrpc: '2.0'; method: string; params?: unknown }

interface PendingRequest { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }

// ─── Transport Base ────────────────────────────────────────
abstract class MCPTransportBase extends EventEmitter {
    protected pending = new Map<string | number, PendingRequest>()
    protected msgId = 0
    abstract connect(): Promise<void>
    abstract disconnect(): void
    abstract sendRaw(msg: JsonRpcRequest): void

    async call(method: string, params?: unknown): Promise<unknown> {
        const id = ++this.msgId
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id)
                reject(new Error(`MCP timeout: ${method}`))
            }, 30_000)
            this.pending.set(id, { resolve, reject, timer })
            this.sendRaw({ jsonrpc: '2.0', id, method, params })
        })
    }

    protected handleMessage(msg: JsonRpcResponse | JsonRpcNotification) {
        if ('id' in msg && msg.id != null) {
            const p = this.pending.get(msg.id)
            if (p) {
                clearTimeout(p.timer)
                this.pending.delete(msg.id)
                if (msg.error) p.reject(new Error(msg.error.message))
                else p.resolve(msg.result)
            }
        } else {
            this.emit('notification', msg)
        }
    }
}

// ─── Stdio Transport ───────────────────────────────────────
class StdioTransport extends MCPTransportBase {
    private proc?: ChildProcess
    private buf = ''

    constructor(private command: string, private args: string[], private env: Record<string, string> = {}) {
        super()
    }

    async connect(): Promise<void> {
        const resolvedCmd = resolveCommand(this.command)
        logger.info(`MCP stdio: spawning ${resolvedCmd} ${this.args.join(' ')}`)
        this.proc = spawn(resolvedCmd, this.args, {
            shell: true,
            env: { ...process.env, ...this.env },
            stdio: ['pipe', 'pipe', 'pipe'],
        })

        this.proc.stdout?.on('data', (chunk: Buffer) => {
            this.buf += chunk.toString()
            const lines = this.buf.split('\n')
            this.buf = lines.pop() ?? ''
            for (const line of lines) {
                if (!line.trim()) continue
                try { this.handleMessage(JSON.parse(line)) }
                catch (e) { logger.warn(`MCP stdio parse error: ${e}`) }
            }
        })

        this.proc.on('exit', (code) => {
            this.emit('disconnect', code)
            logger.warn(`MCP process exited with code ${code}`)
        })

        this.proc.stderr?.on('data', (d: Buffer) => logger.debug(`MCP stderr: ${d.toString()}`))
    }

    sendRaw(msg: JsonRpcRequest): void {
        const line = JSON.stringify(msg) + '\n'
        this.proc?.stdin?.write(line)
    }

    disconnect(): void {
        this.proc?.kill()
        this.proc = undefined
    }
}

// ─── SSE Transport ─────────────────────────────────────────
class SSETransport extends MCPTransportBase {
    private es?: EventSource | { onmessage: ((e: MessageEvent) => void) | null; onerror: (() => void) | null; onopen: (() => void) | null; close(): void }

    constructor(private url: string) { super() }

    async connect(): Promise<void> {
        // Use native EventSource (Node 18+ has it globally via --experimental-fetch,
        // Node 22+ has it stable). Fall back to fetch-based polling if unavailable.
        const ESClass = (globalThis as unknown as Record<string, unknown>)['EventSource'] as
            (new (url: string) => EventSource) | undefined

        if (!ESClass) {
            // Fallback: use long-polling via fetch for older Node versions
            logger.warn(`EventSource not available natively — SSE transport requires Node 22+`)
            throw new Error('SSE transport requires Node 22+ or a native EventSource implementation')
        }

        this.es = new ESClass(this.url)

        this.es.onmessage = (e: MessageEvent) => {
            try { this.handleMessage(JSON.parse(e.data)) }
            catch (err) { logger.warn(`MCP SSE parse error: ${err}`) }
        }

        this.es.onerror = () => this.emit('disconnect', 'sse_error')

        await new Promise<void>((res, rej) => {
            const t = setTimeout(() => rej(new Error('SSE connection timeout')), 10_000)
            this.es!.onopen = () => { clearTimeout(t); res() }
        })
    }

    sendRaw(msg: JsonRpcRequest): void {
        // SSE is one-way; POST for requests
        fetch(this.url.replace('/sse', '/rpc'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(msg),
        }).catch(e => logger.error(`MCP SSE send error: ${e}`))
    }

    disconnect(): void { this.es?.close(); this.es = undefined }
}

// ─── MCPManager ────────────────────────────────────────────
import { execSync } from 'child_process'
import * as os from 'os'

// Resolve full path to a command (handles Windows .cmd, macOS/Linux PATH)
function resolveCommand(cmd: string): string {
    // On Windows, 'npx' is 'npx.cmd'
    const candidates = process.platform === 'win32'
        ? [cmd + '.cmd', cmd + '.ps1', cmd]
        : [cmd]

    for (const candidate of candidates) {
        try {
            const result = execSync(
                process.platform === 'win32' ? `where ${candidate}` : `which ${candidate}`,
                { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }
            ).trim().split('\n')[0].trim()
            if (result) return result
        } catch {
            //
        }
    }

    // Fallback: check common locations
    const commonPaths = process.platform === 'win32'
        ? [
            `${process.env.APPDATA}\npm\${cmd}.cmd`,
            `C:\Program Files\nodejs\${cmd}.cmd`,
        ]
        : [
            `/usr/local/bin/${cmd}`,
            `/usr/bin/${cmd}`,
            `${os.homedir()}/.nvm/current/bin/${cmd}`,
            `${os.homedir()}/.volta/bin/${cmd}`,
        ]

    for (const p of commonPaths) {
        try {
            fs.accessSync(p, fs.constants.X_OK)
            return p
        } catch {
            //
        }
    }

    return cmd // Return as-is and let spawn fail with a clear message
}

export class MCPManager extends EventEmitter {
    private connections = new Map<string, MCPTransportBase>()
    private servers: Map<string, MCPServer> = new Map()

    getServers(): MCPServer[] { return [...this.servers.values()] }

    getServer(id: string): MCPServer | undefined { return this.servers.get(id) }

    async addServer(config: Omit<MCPServer, 'id' | 'createdAt' | 'status' | 'tools' | 'resources'>): Promise<MCPServer> {
        const server: MCPServer = {
            ...config,
            id: uuid(),
            status: 'disconnected',
            tools: [],
            resources: [],
            createdAt: new Date().toISOString(),
        }
        this.servers.set(server.id, server)
        if (config.enabled) await this.connect(server.id)
        return server
    }

    async removeServer(id: string): Promise<void> {
        await this.disconnect(id)
        this.servers.delete(id)
    }

    async connect(id: string): Promise<void> {
        const server = this.servers.get(id)
        if (!server) throw new Error(`MCP server ${id} not found`)

        this.updateServer(id, { status: 'connecting', error: undefined })

        try {
            let transport: MCPTransportBase

            if (server.transport === 'stdio') {
                if (!server.command) throw new Error('stdio transport requires command')
                transport = new StdioTransport(server.command, server.args ?? [], server.env ?? {})
            } else if (server.transport === 'sse') {
                if (!server.url) throw new Error('sse transport requires url')
                transport = new SSETransport(server.url)
            } else {
                throw new Error(`Unsupported MCP transport: ${server.transport}`)
            }

            transport.on('disconnect', () => {
                this.updateServer(id, { status: 'disconnected' })
                this.connections.delete(id)
                this.emit('server:disconnect', id)
            })

            await transport.connect()
            this.connections.set(id, transport)

            // Initialize MCP handshake
            await transport.call('initialize', {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {}, resources: {} },
                clientInfo: { name: 'AgentOS', version: '2.0.0' },
            })

            // Discover tools
            const toolsResult = await transport.call('tools/list') as { tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> }
            const tools: MCPTool[] = (toolsResult?.tools ?? []).map(t => ({
                name: t.name, description: t.description,
                inputSchema: t.inputSchema, serverId: id,
            }))

            // Discover resources
            let resources: MCPResource[] = []
            try {
                const resResult = await transport.call('resources/list') as { resources?: Array<{ uri: string; name: string; description: string; mimeType?: string }> }
                resources = (resResult?.resources ?? []).map(r => ({
                    uri: r.uri, name: r.name, description: r.description,
                    mimeType: r.mimeType, serverId: id,
                }))
            } catch {
                //
            } // resources are optional

            this.updateServer(id, { status: 'connected', tools, resources })
            this.emit('server:connect', id, tools)
            logger.info(`MCP server connected: ${server.name} (${tools.length} tools)`)

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            this.updateServer(id, { status: 'error', error: msg })
            this.emit('server:error', id, msg)
            logger.error(`MCP server connection failed [${server.name}]: ${msg}`)
            throw err
        }
    }

    async disconnect(id: string): Promise<void> {
        const transport = this.connections.get(id)
        if (transport) { transport.disconnect(); this.connections.delete(id) }
        this.updateServer(id, { status: 'disconnected' })
    }

    async callTool(serverId: string, toolName: string, input: Record<string, unknown>): Promise<string> {
        const transport = this.connections.get(serverId)
        if (!transport) throw new Error(`MCP server ${serverId} not connected`)

        const result = await transport.call('tools/call', { name: toolName, arguments: input }) as {
            content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>
            isError?: boolean
        }

        const parts = result?.content ?? []
        const text = parts.map(p => p.text ?? p.data ?? '').join('\n')
        if (result?.isError) throw new Error(text)
        return text
    }

    async readResource(serverId: string, uri: string): Promise<string> {
        const transport = this.connections.get(serverId)
        if (!transport) throw new Error(`MCP server ${serverId} not connected`)

        const result = await transport.call('resources/read', { uri }) as {
            contents?: Array<{ uri: string; text?: string; blob?: string; mimeType?: string }>
        }

        return result?.contents?.map(c => c.text ?? '').join('\n') ?? ''
    }

    getAllTools(): MCPTool[] {
        return [...this.servers.values()].flatMap(s => s.tools)
    }

    getToolsForAgents(serverIds: string[]): MCPTool[] {
        return serverIds.flatMap(sid => this.servers.get(sid)?.tools ?? [])
    }

    async disconnectAll(): Promise<void> {
        for (const id of this.connections.keys()) await this.disconnect(id)
    }

    private updateServer(id: string, patch: Partial<MCPServer>): void {
        const s = this.servers.get(id)
        if (s) {
            Object.assign(s, patch)
            this.emit('server:update', s)
        }
    }
}
