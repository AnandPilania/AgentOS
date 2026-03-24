import { v4 as uuid } from 'uuid'
import { EventEmitter } from 'eventemitter3'
import type { Pipeline, PipelineNode, PipelineEdge, PipelineRun, PipelineStatus } from '../../shared/types'
import type { AgentManager } from './AgentManager'
import type { DatabaseManager } from './DatabaseManager'
import { logger } from '../utils/logger'

export class PipelineManager extends EventEmitter {
  constructor(
    private db:     DatabaseManager,
    private agents: AgentManager,
  ) { super() }

  create(data: Partial<Pipeline> & { name: string; sessionId: string }): Pipeline {
    const now = new Date().toISOString()
    const pipeline: Pipeline = {
      id:        uuid(),
      name:      data.name,
      sessionId: data.sessionId,
      status:    'idle',
      nodes:     data.nodes ?? [],
      edges:     data.edges ?? [],
      runs:      [],
      createdAt: now,
      updatedAt: now,
    }
    this.db.run(
      `INSERT INTO pipelines (id,name,session_id,status,nodes,edges,runs,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [pipeline.id, pipeline.name, pipeline.sessionId, pipeline.status,
       JSON.stringify(pipeline.nodes), JSON.stringify(pipeline.edges),
       JSON.stringify(pipeline.runs), pipeline.createdAt, pipeline.updatedAt]
    )
    return pipeline
  }

  list(sessionId?: string): Pipeline[] {
    const sql = sessionId
      ? 'SELECT * FROM pipelines WHERE session_id = ? ORDER BY created_at DESC'
      : 'SELECT * FROM pipelines ORDER BY created_at DESC'
    return this.db.all<Record<string, string>>(sql, sessionId ? [sessionId] : []).map(r => this.rowToPipeline(r))
  }

  get(id: string): Pipeline | undefined {
    const r = this.db.get<Record<string, string>>('SELECT * FROM pipelines WHERE id = ?', [id])
    return r ? this.rowToPipeline(r) : undefined
  }

  update(id: string, patch: Partial<Pipeline>): void {
    const now = new Date().toISOString()
    if (patch.nodes !== undefined) this.db.run('UPDATE pipelines SET nodes=?,updated_at=? WHERE id=?', [JSON.stringify(patch.nodes), now, id])
    if (patch.edges !== undefined) this.db.run('UPDATE pipelines SET edges=?,updated_at=? WHERE id=?', [JSON.stringify(patch.edges), now, id])
    if (patch.name  !== undefined) this.db.run('UPDATE pipelines SET name=?,updated_at=? WHERE id=?',  [patch.name, now, id])
  }

  delete(id: string): void {
    this.db.run('DELETE FROM pipelines WHERE id = ?', [id])
  }

  // ─── Pipeline Execution ────────────────────────────────
  async run(id: string): Promise<PipelineRun> {
    const pipeline = this.get(id)
    if (!pipeline) throw new Error(`Pipeline ${id} not found`)

    const run: PipelineRun = {
      id:          uuid(),
      pipelineId:  id,
      status:      'running',
      startedAt:   new Date().toISOString(),
      nodeResults: {},
    }

    this.updateStatus(id, 'running')
    this.emit('run:start', { pipelineId: id, run })

    try {
      // Topological execution
      const result = await this.executeNodes(pipeline, run)
      run.status  = 'done'
      run.endedAt = new Date().toISOString()
      run.nodeResults = result
    } catch (err: unknown) {
      run.status  = 'error'
      run.endedAt = new Date().toISOString()
      run.error   = err instanceof Error ? err.message : String(err)
      logger.error(`Pipeline ${id} failed: ${run.error}`)
    }

    this.updateStatus(id, run.status)
    this.emit('run:end', { pipelineId: id, run })

    // Persist run
    const existing = this.get(id)
    if (existing) {
      existing.runs.push(run)
      this.db.run('UPDATE pipelines SET runs=?,updated_at=? WHERE id=?',
        [JSON.stringify(existing.runs), new Date().toISOString(), id])
    }

    return run
  }

  private async executeNodes(
    pipeline: Pipeline,
    run: PipelineRun,
  ): Promise<Record<string, unknown>> {
    const results: Record<string, unknown> = {}
    const visited = new Set<string>()
    const executionOrder = this.topologicalSort(pipeline.nodes, pipeline.edges)

    for (const nodeId of executionOrder) {
      const node = pipeline.nodes.find(n => n.id === nodeId)
      if (!node) continue

      this.emit('node:start', { pipelineId: pipeline.id, nodeId, run })

      try {
        const nodeResult = await this.executeNode(node, pipeline.edges, results)
        results[nodeId] = nodeResult
        visited.add(nodeId)
        this.emit('node:done', { pipelineId: pipeline.id, nodeId, result: nodeResult, run })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        results[nodeId] = { error: msg }
        this.emit('node:error', { pipelineId: pipeline.id, nodeId, error: msg, run })

        // Check if pipeline should stop on error
        const hasErrorEdge = pipeline.edges.some(e => e.source === nodeId && e.type === 'error')
        if (!hasErrorEdge) throw err
      }
    }

    return results
  }

  private async executeNode(
    node: PipelineNode,
    edges: PipelineEdge[],
    prevResults: Record<string, unknown>,
  ): Promise<unknown> {
    switch (node.type) {
      case 'input': {
        return node.data.config.initialInput ?? ''
      }

      case 'agent': {
        const agentId = node.data.agentId
        if (!agentId) throw new Error(`Agent node ${node.id} has no agentId`)

        // Get input from connected source nodes
        const incomingEdges = edges.filter(e => e.target === node.id)
        const inputParts: string[] = []
        for (const edge of incomingEdges) {
          const prev = prevResults[edge.source]
          if (typeof prev === 'string') inputParts.push(prev)
          else if (prev && typeof prev === 'object') inputParts.push(JSON.stringify(prev))
        }
        const input = inputParts.join('\n\n') || (node.data.config.defaultPrompt as string ?? 'Process the input.')

        await this.agents.start(agentId)
        await this.agents.sendMessage(agentId, input)

        // Wait for agent to finish (poll)
        await new Promise<void>((resolve, reject) => {
          const check = setInterval(() => {
            const a = this.agents.get(agentId)
            if (!a) { clearInterval(check); reject(new Error('Agent not found')); return }
            if (a.status === 'idle' || a.status === 'done') { clearInterval(check); resolve() }
            if (a.status === 'error') { clearInterval(check); reject(new Error('Agent error')) }
          }, 500)
          setTimeout(() => { clearInterval(check); reject(new Error('Agent timeout')) }, 120_000)
        })

        // Return last assistant message
        const msgs = this.agents.getMessages(agentId)
        const lastAssistant = msgs.filter(m => m.role === 'assistant').pop()
        return lastAssistant?.content ?? ''
      }

      case 'transform': {
        const incomingEdges = edges.filter(e => e.target === node.id)
        const input = incomingEdges.map(e => prevResults[e.source]).join('\n')
        const transform = node.data.transform ?? 'return input'
        // Safe eval with restricted scope
        const fn = new Function('input', transform)
        return fn(input)
      }

      case 'condition': {
        const incomingEdges = edges.filter(e => e.target === node.id)
        const input = incomingEdges.map(e => prevResults[e.source]).join('\n')
        const condition = node.data.condition ?? 'return true'
        const fn = new Function('input', condition)
        return { result: fn(input), input }
      }

      case 'merge': {
        const incomingEdges = edges.filter(e => e.target === node.id)
        return incomingEdges.map(e => prevResults[e.source]).filter(Boolean)
      }

      case 'output': {
        const incomingEdges = edges.filter(e => e.target === node.id)
        return incomingEdges.map(e => prevResults[e.source]).join('\n')
      }

      default:
        return null
    }
  }

  private topologicalSort(nodes: PipelineNode[], edges: PipelineEdge[]): string[] {
    const inDegree: Record<string, number> = {}
    const adj: Record<string, string[]>    = {}

    nodes.forEach(n => { inDegree[n.id] = 0; adj[n.id] = [] })
    edges.forEach(e => {
      adj[e.source] = adj[e.source] ?? []
      adj[e.source].push(e.target)
      inDegree[e.target] = (inDegree[e.target] ?? 0) + 1
    })

    const queue  = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id)
    const result: string[] = []

    while (queue.length > 0) {
      const id = queue.shift()!
      result.push(id)
      for (const next of (adj[id] ?? [])) {
        inDegree[next]--
        if (inDegree[next] === 0) queue.push(next)
      }
    }

    return result
  }

  private updateStatus(id: string, status: PipelineStatus): void {
    this.db.run('UPDATE pipelines SET status=?,updated_at=? WHERE id=?',
      [status, new Date().toISOString(), id])
    this.emit('status', { pipelineId: id, status })
  }

  private rowToPipeline(r: Record<string, string>): Pipeline {
    return {
      id:r.id, name:r.name, sessionId:r.session_id,
      status:r.status as PipelineStatus,
      nodes:JSON.parse(r.nodes??'[]'), edges:JSON.parse(r.edges??'[]'),
      runs:JSON.parse(r.runs??'[]'),
      createdAt:r.created_at, updatedAt:r.updated_at,
    }
  }
}
