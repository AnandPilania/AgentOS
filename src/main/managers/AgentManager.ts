import { v4 as uuid } from 'uuid'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { EventEmitter } from 'eventemitter3'
import type {
    Agent, AgentMessage, AgentStats, AIProvider, BuiltinTool,
    ToolCall
} from '../../shared/types'
import { DatabaseManager } from './DatabaseManager'
import { SettingsManager } from './SettingsManager'
import { WorkspaceManager } from './WorkspaceManager'
import { AuditManager } from './AuditManager'
import { MCPManager } from './MCPManager'
import { ToolEngine, BUILTIN_TOOL_DEFINITIONS } from './ToolEngine'
import { logger } from '../utils/logger'
import type { BrowserWindow } from 'electron'

// Unified tool definition for all providers
interface AnthropicToolDef {
    name: string
    description: string
    input_schema: Record<string, unknown>
}

// Cost per 1M tokens (USD)
const MODEL_COSTS: Record<string, { in: number; out: number }> = {
    'claude-opus-4-5': { in: 15, out: 75 },
    'claude-sonnet-4-5': { in: 3, out: 15 },
    'claude-haiku-4-5-20251001': { in: 0.25, out: 1.25 },
    'gpt-4o': { in: 5, out: 15 },
    'gpt-4o-mini': { in: 0.15, out: 0.6 },
    'gpt-4-turbo': { in: 10, out: 30 },
    'gemini-1.5-pro': { in: 3.5, out: 10.5 },
    'gemini-1.5-flash': { in: 0.35, out: 1.05 },
}

interface RunningAgent { agent: Agent; abortCtl: AbortController }

export class AgentManager extends EventEmitter {
    private running = new Map<string, RunningAgent>()
    private activeCount = 0
    private toolEngine = new ToolEngine()
    private windows: BrowserWindow[] = []

    constructor(
        private db: DatabaseManager,
        private settings: SettingsManager,
        private workspaces: WorkspaceManager,
        private audit: AuditManager,
        private mcp: MCPManager,
    ) { super() }

    setWindow(w: BrowserWindow) { this.windows = [w] }

    private push(channel: string, data: unknown) {
        this.windows.forEach(w => { if (!w.isDestroyed()) w.webContents.send(channel, data) })
    }

    // ─── CRUD ─────────────────────────────────────────────
    async create(data: Partial<Agent> & { workspaceId: string; provider: AIProvider; model: string }): Promise<Agent> {
        const now = new Date().toISOString()
        const agent: Agent = {
            id: uuid(),
            name: data.name ?? `Agent #${Date.now()}`,
            status: 'idle',
            provider: data.provider,
            model: data.model,
            workspaceId: data.workspaceId,
            sessionId: data.sessionId ?? uuid(),
            templateId: data.templateId,
            prompt: data.prompt,
            tags: data.tags ?? [],
            metadata: data.metadata ?? {},
            mcpServers: data.mcpServers ?? [],
            tools: data.tools ?? ['read_file', 'write_file', 'list_files', 'bash', 'search_code', 'git_status', 'git_diff'],
            maxTokens: data.maxTokens ?? 8096,
            temperature: data.temperature ?? 0,
            stats: { tokensIn: 0, tokensOut: 0, cost: 0, duration: 0, turns: 0, toolCalls: 0, errors: 0 },
            createdAt: now,
            updatedAt: now,
        }
        this.db.run(
            `INSERT INTO agents (id,name,status,provider,model,workspace_id,session_id,template_id,prompt,tags,metadata,mcp_servers,tools,max_tokens,temperature,stats,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [agent.id, agent.name, agent.status, agent.provider, agent.model,
            agent.workspaceId, agent.sessionId, agent.templateId ?? null,
            agent.prompt ?? null, JSON.stringify(agent.tags), JSON.stringify(agent.metadata),
            JSON.stringify(agent.mcpServers), JSON.stringify(agent.tools),
            agent.maxTokens, agent.temperature, JSON.stringify(agent.stats),
            agent.createdAt, agent.updatedAt]
        )
        this.audit.log({ userId: 'system', action: 'agent.create', resource: 'agent', resourceId: agent.id, metadata: { provider: agent.provider, model: agent.model }, severity: 'low' })
        logger.info(`Agent created: ${agent.id} [${agent.provider}/${agent.model}]`)
        return agent
    }

    async destroy(id: string): Promise<void> {
        await this.stop(id)
        this.db.run('DELETE FROM agents WHERE id = ?', [id])
    }

    list(): Agent[] {
        return this.db.all<Record<string, string>>('SELECT * FROM agents ORDER BY created_at DESC').map(r => this.rowToAgent(r))
    }

    get(id: string): Agent | undefined {
        const r = this.db.get<Record<string, string>>('SELECT * FROM agents WHERE id = ?', [id])
        return r ? this.rowToAgent(r) : undefined
    }

    // ─── Lifecycle ────────────────────────────────────────
    async start(id: string): Promise<void> {
        const agent = this.get(id)
        if (!agent) throw new Error(`Agent ${id} not found`)
        if (this.running.has(id)) return  // already running
        const abortCtl = new AbortController()
        this.running.set(id, { agent, abortCtl })
        this.updateStatus(id, 'running')
        logger.info(`Agent started: ${id}`)
    }

    async stop(id: string): Promise<void> {
        this.running.get(id)?.abortCtl.abort()
        this.running.delete(id)
        this.updateStatus(id, 'idle')
    }

    async pause(id: string): Promise<void> { this.updateStatus(id, 'paused') }

    async stopAll(): Promise<void> {
        for (const id of [...this.running.keys()]) await this.stop(id)
    }

    // ─── Send Message ─────────────────────────────────────
    async sendMessage(agentId: string, message: string): Promise<void> {
        const agent = this.get(agentId)
        if (!agent) throw new Error(`Agent ${agentId} not found`)
        if (!message?.trim()) {
            logger.warn(`sendMessage called with empty message for agent ${agentId}`)
            return
        }

        // Save + broadcast user message first
        const userMsg: AgentMessage = {
            id: uuid(), agentId, role: 'user',
            content: message.trim(),
            timestamp: new Date().toISOString(),
        }
        this.saveMessage(userMsg)
        this.push('agent:message-chunk', { agentId, message: userMsg, done: false })

        // Mark agent as running
        this.updateStatus(agentId, 'running')

        // Run in background (don't await — ipcMain handler returns immediately)
        this.runWithRetry(agent, message.trim()).catch(err => {
            const msg = err instanceof Error ? err.message : String(err)
            logger.error(`Agent ${agentId} failed: ${msg}`)
            this.updateStatus(agentId, 'error')
            this.push('agent:error', { agentId, error: msg })
            this.incrementStat(agentId, 'errors', 1)
            this.emit('turn:error', agentId, msg)   // ← ADD
        })
    }

    private async runWithRetry(agent: Agent, message: string, attempt = 1): Promise<void> {
        try {
            await this.runAgentTurn(agent, message)
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            if (attempt < 3) {
                logger.warn(`Agent ${agent.id} retry ${attempt}: ${msg}`)
                await new Promise(r => setTimeout(r, attempt * 1000))
                return this.runWithRetry(agent, message, attempt + 1)
            }
            throw err
        }
    }

    // ─── Core Turn ────────────────────────────────────────
    private async runAgentTurn(agent: Agent, userMessage: string): Promise<void> {
        // Get full history including the user message we just saved
        const history = this.getMessages(agent.id)
        const ws = this.workspaces.get(agent.workspaceId)
        const cfg = this.settings.getProviderConfig(agent.provider)

        const builtinDefs: AnthropicToolDef[] = BUILTIN_TOOL_DEFINITIONS
            .filter(t => agent.tools.includes(t.name as BuiltinTool))
            .map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema as Record<string, unknown> }))

        const mcpDefs: AnthropicToolDef[] = this.mcp.getToolsForAgents(agent.mcpServers).map(t => ({
            name: `mcp__${t.serverId}__${t.name}`,
            description: t.description,
            input_schema: t.inputSchema,
        }))

        const allTools: AnthropicToolDef[] = [...builtinDefs, ...mcpDefs]

        try {
            if (agent.provider === 'anthropic') {
                await this.runAnthropicTurn(agent, history, allTools, cfg?.apiKey ?? '', ws?.path)
            } else if (agent.provider === 'openai') {
                await this.runOpenAITurn(agent, history, allTools, cfg?.apiKey ?? '', ws?.path)
            } else if (agent.provider === 'gemini') {
                await this.runGeminiTurn(agent, history, userMessage, cfg?.apiKey ?? '')
            } else if (agent.provider === 'ollama') {
                await this.runOllamaTurn(agent, history, allTools, cfg?.baseUrl ?? 'http://localhost:11434', ws?.path)
            } else if (agent.provider === 'custom') {
                await this.runOpenAITurn(agent, history, allTools, cfg?.apiKey ?? '', ws?.path, cfg?.baseUrl)
            }
        } finally {
            // Always return to idle after a turn
            this.updateStatus(agent.id, 'idle')
            this.incrementStat(agent.id, 'turns', 1)
            this.emit('turn:done', agent.id)
        }
    }

    // ─── Anthropic ────────────────────────────────────────
    private async runAnthropicTurn(
        agent: Agent, history: AgentMessage[], tools: AnthropicToolDef[],
        apiKey: string, wsPath?: string,
    ): Promise<void> {
        if (!apiKey) throw new Error('Anthropic API key not configured. Add it in Settings → AI Providers.')
        const client = new Anthropic({ apiKey })
        const messages = this.toAnthropicMessages(history)
        let looping = true

        while (looping) {
            const msgId = uuid()
            let fullText = ''

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const streamParams: any = {
                model: agent.model,
                max_tokens: agent.maxTokens,
                temperature: agent.temperature,
                system: agent.prompt ?? 'You are an expert AI coding assistant.',
                messages,
                tools: tools.length > 0 ? tools.map(t => ({
                    name: t.name, description: t.description, input_schema: t.input_schema,
                })) : undefined,
            }

            const stream = client.messages.stream(streamParams)

            stream.on('text', (text) => {
                fullText += text
                this.push('agent:message-chunk', { agentId: agent.id, chunk: text, msgId, done: false })
            })

            const final = await stream.finalMessage()
            const tokIn = final.usage.input_tokens
            const tokOut = final.usage.output_tokens
            this.recordCost(agent, tokIn, tokOut)

            if (fullText) {
                const assistMsg: AgentMessage = {
                    id: uuid(), agentId: agent.id, role: 'assistant', content: fullText,
                    timestamp: new Date().toISOString(), tokens: tokIn + tokOut,
                    cost: this.calcCost(agent.model, tokIn, tokOut), model: agent.model,
                }
                this.saveMessage(assistMsg)
                this.push('agent:message-chunk', { agentId: agent.id, message: assistMsg, msgId, done: true })
                messages.push({ role: 'assistant', content: fullText })
            }

            const toolUseBlocks = final.content.filter(b => b.type === 'tool_use') as Array<{ type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }>

            if (toolUseBlocks.length === 0 || final.stop_reason === 'end_turn') {
                looping = false
            } else {
                const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = []
                for (const block of toolUseBlocks) {
                    const tc: ToolCall = { id: block.id, name: block.name, input: block.input, status: 'running', startedAt: new Date().toISOString() }
                    this.push('agent:tool-call', { agentId: agent.id, toolCall: tc })
                    let resultStr: string
                    try {
                        if (block.name.startsWith('mcp__')) {
                            const parts = block.name.split('__')
                            resultStr = await this.mcp.callTool(parts[1], parts[2], block.input)
                        } else {
                            const result = await this.toolEngine.execute(
                                block.name as BuiltinTool, block.input,
                                {
                                    workspacePath: wsPath ?? '', agentId: agent.id,
                                    onProgress: (m) => this.push('agent:tool-progress', { agentId: agent.id, message: m })
                                }
                            )
                            resultStr = result.output
                        }
                        tc.status = 'done'; tc.endedAt = new Date().toISOString()
                    } catch (err) {
                        resultStr = `Error: ${err instanceof Error ? err.message : String(err)}`
                        tc.status = 'error'; tc.endedAt = new Date().toISOString(); tc.error = resultStr
                    }
                    this.push('agent:tool-call', { agentId: agent.id, toolCall: tc })
                    this.incrementStat(agent.id, 'toolCalls', 1)
                    toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: resultStr })
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                messages.push({ role: 'assistant', content: final.content as any })
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                messages.push({ role: 'user', content: toolResults as any })
            }
        }
    }

    // ─── OpenAI ───────────────────────────────────────────
    private async runOpenAITurn(
        agent: Agent, history: AgentMessage[], tools: AnthropicToolDef[],
        apiKey: string, wsPath?: string, baseUrl?: string,
    ): Promise<void> {
        if (!apiKey) throw new Error('OpenAI API key not configured. Add it in Settings → AI Providers.')
        const client = new OpenAI({ apiKey, ...(baseUrl ? { baseURL: baseUrl } : {}) })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const messages: any[] = [
            { role: 'system', content: agent.prompt ?? 'You are an expert AI coding assistant.' },
            ...history.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
        ]

        let looping = true
        while (looping) {
            const msgId = uuid()
            let fullText = ''
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const toolCallAccum: Record<number, { id: string; name: string; arguments: string }> = {}

            const stream = await client.chat.completions.create({
                model: agent.model,
                messages,
                tools: tools.length > 0 ? tools.map(t => ({
                    type: 'function' as const,
                    function: { name: t.name, description: t.description, parameters: t.input_schema },
                })) : undefined,
                stream: true,
            })

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta
                if (delta?.content) {
                    fullText += delta.content
                    this.push('agent:message-chunk', { agentId: agent.id, chunk: delta.content, msgId, done: false })
                }
                if (delta?.tool_calls) {
                    for (const tc of delta.tool_calls) {
                        if (!toolCallAccum[tc.index]) toolCallAccum[tc.index] = { id: tc.id ?? '', name: tc.function?.name ?? '', arguments: '' }
                        if (tc.id) toolCallAccum[tc.index].id = tc.id
                        if (tc.function?.name) toolCallAccum[tc.index].name = tc.function.name
                        if (tc.function?.arguments) toolCallAccum[tc.index].arguments += tc.function.arguments
                    }
                }
            }

            const callsList = Object.values(toolCallAccum)

            if (fullText) {
                const msg: AgentMessage = { id: uuid(), agentId: agent.id, role: 'assistant', content: fullText, timestamp: new Date().toISOString(), model: agent.model }
                this.saveMessage(msg)
                this.push('agent:message-chunk', { agentId: agent.id, message: msg, msgId, done: true })
                messages.push({ role: 'assistant', content: fullText })
            }

            if (callsList.length === 0) {
                looping = false
            } else {
                messages.push({ role: 'assistant', content: '', tool_calls: callsList.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: tc.arguments } })) })
                for (const tc of callsList) {
                    let result: string
                    try {
                        const parsed = JSON.parse(tc.arguments || '{}')
                        const r = await this.toolEngine.execute(tc.name as BuiltinTool, parsed, { workspacePath: wsPath ?? '', agentId: agent.id })
                        result = r.output
                    } catch (e) { result = `Error: ${e}` }
                    messages.push({ role: 'tool', tool_call_id: tc.id, content: result })
                    this.incrementStat(agent.id, 'toolCalls', 1)
                }
            }
        }
    }

    // ─── Gemini ───────────────────────────────────────────
    private async runGeminiTurn(agent: Agent, history: AgentMessage[], userMsg: string, apiKey: string): Promise<void> {
        if (!apiKey) throw new Error('Gemini API key not configured. Add it in Settings → AI Providers.')
        const genAI = new GoogleGenerativeAI(apiKey)
        const modelConfig: Record<string, unknown> = { model: agent.model }
        if (agent.prompt) modelConfig['systemInstruction'] = agent.prompt
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const model = genAI.getGenerativeModel(modelConfig as any)
        const msgId = uuid()
        let text = ''
        const result = await model.generateContentStream(userMsg)
        for await (const chunk of result.stream) {
            const t = chunk.text()
            if (t) {
                text += t
                this.push('agent:message-chunk', { agentId: agent.id, chunk: t, msgId, done: false })
            }
        }
        const msg: AgentMessage = { id: uuid(), agentId: agent.id, role: 'assistant', content: text || '(empty response)', timestamp: new Date().toISOString() }
        this.saveMessage(msg)
        this.push('agent:message-chunk', { agentId: agent.id, message: msg, msgId, done: true })
    }

    // ─── Ollama ───────────────────────────────────────────
    private async runOllamaTurn(
        agent: Agent,
        history: AgentMessage[],
        tools: AnthropicToolDef[],
        baseUrl: string,
        wsPath?: string,
    ): Promise<void> {
        // Build messages array
        const messages: Array<{
            role: string; content: string
            tool_calls?: unknown[]; tool_call_id?: string
        }> = []
        if (agent.prompt) messages.push({ role: 'system', content: agent.prompt })
        for (const m of history.filter(x => x.role === 'user' || x.role === 'assistant')) {
            messages.push({ role: m.role, content: m.content })
        }

        // Ollama uses the same function-calling format as OpenAI
        const ollamaTools = tools.length > 0
            ? tools.map(t => ({
                type: 'function',
                function: { name: t.name, description: t.description, parameters: t.input_schema },
            }))
            : undefined

        let looping = true

        while (looping) {
            const msgId = uuid()
            let fullText = ''
            const tcAccum: Record<number, { id: string; name: string; arguments: string }> = {}

            let resp: Response
            try {
                resp = await fetch(`${baseUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: agent.model,
                        messages,
                        tools: ollamaTools,
                        stream: true,
                    }),
                })
            } catch (err) {
                throw new Error(
                    `Cannot connect to Ollama at ${baseUrl}. Is Ollama running? (${err instanceof Error ? err.message : err})`
                )
            }

            if (!resp.ok) {
                const body = await resp.text().catch(() => '')
                throw new Error(`Ollama error ${resp.status}: ${body || resp.statusText}`)
            }

            const reader = resp.body?.getReader()
            if (!reader) throw new Error('No response body from Ollama')
            const decoder = new TextDecoder()

            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                for (const line of decoder.decode(value, { stream: true }).split('\n')) {
                    if (!line.trim()) continue
                    let j: Record<string, unknown>
                    try { j = JSON.parse(line) } catch { continue }

                    const msg = j.message as Record<string, unknown> | undefined

                    // Text fragment
                    const txt = msg?.content
                    if (typeof txt === 'string' && txt) {
                        fullText += txt
                        this.push('agent:message-chunk', { agentId: agent.id, chunk: txt, msgId, done: false })
                    }

                    // Tool calls — Ollama emits these in the message object (not deltas)
                    const rawTCs = msg?.tool_calls as Array<Record<string, unknown>> | undefined
                    if (rawTCs?.length) {
                        rawTCs.forEach((tc, idx) => {
                            const fn = (tc.function ?? {}) as Record<string, unknown>
                            if (!tcAccum[idx]) {
                                tcAccum[idx] = {
                                    id: String(tc.id ?? `tc-${idx}-${Date.now()}`),
                                    name: String(fn.name ?? ''),
                                    arguments: typeof fn.arguments === 'string'
                                        ? fn.arguments
                                        : JSON.stringify(fn.arguments ?? {}),
                                }
                            } else if (typeof fn.arguments === 'string') {
                                tcAccum[idx].arguments += fn.arguments
                            }
                        })
                    }
                }
            }

            const callsList = Object.values(tcAccum)

            // Persist text
            if (fullText.trim()) {
                const am: AgentMessage = {
                    id: uuid(), agentId: agent.id, role: 'assistant',
                    content: fullText.trim(), timestamp: new Date().toISOString(), model: agent.model,
                }
                this.saveMessage(am)
                this.push('agent:message-chunk', { agentId: agent.id, message: am, msgId, done: true })
                messages.push({ role: 'assistant', content: fullText.trim() })
            }

            if (callsList.length === 0) {
                looping = false
            } else {
                // Execute tools and collect results
                const toolResults: Array<{ role: string; tool_call_id: string; content: string }> = []

                for (const tc of callsList) {
                    let parsed: Record<string, unknown> = {}
                    try { parsed = JSON.parse(tc.arguments || '{}') } catch { }

                    const tcEvent: ToolCall = {
                        id: tc.id, name: tc.name, input: parsed,
                        status: 'running', startedAt: new Date().toISOString(),
                    }
                    this.push('agent:tool-call', { agentId: agent.id, toolCall: tcEvent })

                    let resultStr: string
                    try {
                        if (tc.name.startsWith('mcp__')) {
                            const parts = tc.name.split('__')
                            resultStr = await this.mcp.callTool(parts[1], parts[2], parsed)
                        } else {
                            const r = await this.toolEngine.execute(
                                tc.name as BuiltinTool, parsed,
                                {
                                    workspacePath: wsPath ?? '',
                                    agentId: agent.id,
                                    onProgress: (m) => this.push('agent:tool-progress', { agentId: agent.id, message: m }),
                                },
                            )
                            resultStr = r.output
                        }
                        tcEvent.status = 'done'; tcEvent.endedAt = new Date().toISOString()
                    } catch (err) {
                        resultStr = `Error: ${err instanceof Error ? err.message : String(err)}`
                        tcEvent.status = 'error'; tcEvent.endedAt = new Date().toISOString()
                        tcEvent.error = resultStr
                    }

                    this.push('agent:tool-call', { agentId: agent.id, toolCall: tcEvent })
                    this.incrementStat(agent.id, 'toolCalls', 1)
                    toolResults.push({ role: 'tool', tool_call_id: tc.id, content: resultStr })
                }

                // Push assistant tool-call message + tool results into context
                messages.push({
                    role: 'assistant', content: '',
                    tool_calls: callsList.map(tc => ({
                        id: tc.id, type: 'function',
                        function: { name: tc.name, arguments: tc.arguments },
                    })),
                })
                messages.push(...toolResults)
            }
        }
    }

    // ─── Messages ─────────────────────────────────────────
    getMessages(agentId: string): AgentMessage[] {
        return this.db.all<Record<string, string>>(
            'SELECT * FROM agent_messages WHERE agent_id = ? ORDER BY timestamp ASC', [agentId]
        ).map(r => ({
            id: r.id, agentId: r.agent_id, role: r.role as AgentMessage['role'],
            content: r.content, timestamp: r.timestamp,
            tokens: r.tokens ? Number(r.tokens) : undefined,
            toolCalls: JSON.parse(r.tool_calls ?? '[]'),
            cost: r.cost ? Number(r.cost) : undefined,
        }))
    }

    private saveMessage(msg: AgentMessage): void {
        this.db.run(
            'INSERT OR IGNORE INTO agent_messages (id,agent_id,role,content,tokens,tool_calls,cost,timestamp) VALUES (?,?,?,?,?,?,?,?)',
            [msg.id, msg.agentId, msg.role, msg.content,
            msg.tokens ?? null, JSON.stringify(msg.toolCalls ?? []), msg.cost ?? null, msg.timestamp]
        )
    }

    // ─── Clone ────────────────────────────────────────────
    async clone(id: string): Promise<Agent> {
        const src = this.get(id)
        if (!src) throw new Error(`Agent ${id} not found`)
        const newWs = await this.workspaces.clone(src.workspaceId)
        return this.create({ ...src, name: `${src.name} (clone)`, workspaceId: newWs.id, tags: [...src.tags, 'cloned'] })
    }

    // ─── Search ───────────────────────────────────────────
    searchMessages(query: string): Array<{ agentId: string; message: AgentMessage }> {
        return this.db.all<Record<string, string>>(
            `SELECT * FROM agent_messages WHERE content LIKE ? ORDER BY timestamp DESC LIMIT 100`,
            [`%${query}%`]
        ).map(r => ({
            agentId: r.agent_id, message: {
                id: r.id, agentId: r.agent_id, role: r.role as AgentMessage['role'],
                content: r.content, timestamp: r.timestamp,
            }
        }))
    }

    // ─── Cost ─────────────────────────────────────────────
    private calcCost(model: string, tokIn: number, tokOut: number): number {
        const p = MODEL_COSTS[model] ?? { in: 5, out: 15 }
        return (tokIn / 1_000_000) * p.in + (tokOut / 1_000_000) * p.out
    }

    private recordCost(agent: Agent, tokIn: number, tokOut: number): void {
        const cost = this.calcCost(agent.model, tokIn, tokOut)
        this.db.run(
            'INSERT INTO cost_entries (id,agent_id,session_id,user_id,provider,model,tokens_in,tokens_out,cost,timestamp) VALUES (?,?,?,?,?,?,?,?,?,?)',
            [uuid(), agent.id, agent.sessionId, 'system', agent.provider, agent.model, tokIn, tokOut, cost, new Date().toISOString()]
        )
        this.incrementStat(agent.id, 'tokensIn', tokIn)
        this.incrementStat(agent.id, 'tokensOut', tokOut)
        this.updateCostStat(agent.id, cost)
    }

    getCostSummary(filters?: { agentId?: string; from?: string; to?: string }): import('../../shared/types').CostSummary {
        let sql = 'SELECT * FROM cost_entries WHERE 1=1'
        const params: unknown[] = []
        if (filters?.agentId) { sql += ' AND agent_id = ?'; params.push(filters.agentId) }
        if (filters?.from) { sql += ' AND timestamp >= ?'; params.push(filters.from) }
        if (filters?.to) { sql += ' AND timestamp <= ?'; params.push(filters.to) }
        const rows = this.db.all<Record<string, string>>(sql, params)
        const total = rows.reduce((s, r) => s + Number(r.cost), 0)
        const byModel: Record<string, number> = {}
        const byAgent: Record<string, number> = {}
        const byProvider: Record<string, number> = {}
        const byDay: Record<string, number> = {}
        let tokIn = 0, tokOut = 0
        rows.forEach(r => {
            const cost = Number(r.cost)
            byModel[r.model] = (byModel[r.model] ?? 0) + cost
            byAgent[r.agent_id] = (byAgent[r.agent_id] ?? 0) + cost
            byProvider[r.provider] = (byProvider[r.provider] ?? 0) + cost
            const day = r.timestamp.slice(0, 10)
            byDay[day] = (byDay[day] ?? 0) + cost
            tokIn += Number(r.tokens_in ?? 0)
            tokOut += Number(r.tokens_out ?? 0)
        })
        return {
            total, byModel, byAgent, byProvider,
            byDay: Object.entries(byDay).map(([date, cost]) => ({ date, cost })).sort((a, b) => a.date.localeCompare(b.date)),
            tokens: { in: tokIn, out: tokOut },
        }
    }

    // ─── Helpers ──────────────────────────────────────────
    private updateStatus(id: string, status: Agent['status']): void {
        this.db.run('UPDATE agents SET status=?,updated_at=? WHERE id=?', [status, new Date().toISOString(), id])
        this.push('agent:status-change', { agentId: id, status })
    }

    private incrementStat(id: string, field: keyof AgentStats, by: number): void {
        const agent = this.get(id)
        if (!agent) return
            ; (agent.stats[field] as number) += by
        this.db.run('UPDATE agents SET stats=? WHERE id=?', [JSON.stringify(agent.stats), id])
    }

    private updateCostStat(id: string, cost: number): void {
        const agent = this.get(id)
        if (!agent) return
        agent.stats.cost += cost
        this.db.run('UPDATE agents SET stats=? WHERE id=?', [JSON.stringify(agent.stats), id])
    }

    private toAnthropicMessages(history: AgentMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
        return history.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({
            role: m.role as 'user' | 'assistant', content: m.content,
        }))
    }

    private rowToAgent(r: Record<string, string>): Agent {
        return {
            id: r.id, name: r.name, status: r.status as Agent['status'],
            provider: r.provider as AIProvider, model: r.model,
            workspaceId: r.workspace_id, sessionId: r.session_id,
            templateId: r.template_id ?? undefined, prompt: r.prompt ?? undefined,
            tags: JSON.parse(r.tags ?? '[]'), metadata: JSON.parse(r.metadata ?? '{}'),
            mcpServers: JSON.parse(r.mcp_servers ?? '[]'), tools: JSON.parse(r.tools ?? '[]'),
            maxTokens: Number(r.max_tokens ?? 8096), temperature: Number(r.temperature ?? 0),
            stats: JSON.parse(r.stats ?? '{"tokensIn":0,"tokensOut":0,"cost":0,"duration":0,"turns":0,"toolCalls":0,"errors":0}'),
            createdAt: r.created_at, updatedAt: r.updated_at,
        }
    }
}
