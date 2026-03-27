/**
 * Leader-centric graph orchestration:
 *
 *   User message
 *        ↓
 *    [Leader] ← always entry point, always exit point
 *        ↓ decides next_action
 *   ┌──────────────────────────────┐
 *   │  "answer"   → reply directly │
 *   │  "done"     → task complete  │
 *   │  "analyst"  → Analyst, then  │
 *   │  "developer"→ Developer,then │  back to Leader with result
 *   │  "qa"       → QA, then       │
 *   └──────────────────────────────┘
 *
 * The leader is the ONLY decision-maker.
 * Other roles are contractors — they do one job and hand back.
 */

import { v4 as uuid } from 'uuid'
import { EventEmitter } from 'eventemitter3'
import type { BuiltinTool } from '../../shared/types'
import type { AgentManager } from './AgentManager'
import type { DatabaseManager } from './DatabaseManager'
import type { WorkspaceContextManager } from './WorkspaceContextManager'
import { logger } from '../utils/logger'

// ─── Types ─────────────────────────────────────────────────────────────────
export type TeamRole = 'leader' | 'analyst' | 'developer' | 'qa'
export type LeaderAction = 'answer' | 'analyst' | 'developer' | 'qa' | 'done'
export type StepStatus = 'pending' | 'running' | 'done' | 'error'

export type TeamRunStatus =
    | 'idle' | 'leader_thinking' | 'analyst_working' | 'developer_working'
    | 'qa_working' | 'done' | 'error' | 'max_steps'

export interface TeamMemberConfig {
    role: TeamRole
    name: string
    agentId: string
    model: string
    provider: string
}

export interface TeamConfig {
    id: string
    name: string
    workspaceId: string
    sessionId: string
    members: TeamMemberConfig[]
    maxSteps: number          // max leader→delegate cycles (default 12)
    createdAt: string
    updatedAt: string
}

// One message in the team conversation log
export interface TeamMessage {
    id: string
    role: 'user' | 'leader' | 'analyst' | 'developer' | 'qa' | 'system'
    content: string           // streaming buffer while in-progress
    streaming: boolean
    timestamp: string
    // If role=developer, the diff captured after their turn
    fileDiff?: FileDiffSummary
    // Parsed leader decision (only when role=leader)
    leaderDecision?: LeaderDecision
}

export interface FileDiffSummary {
    filesChanged: string[]
    additions: number
    deletions: number
    rawDiff: string           // truncated git diff output
}

export interface LeaderDecision {
    nextAction: LeaderAction
    reasoning: string         // why the leader chose this action
    instruction?: string      // what to tell the next agent
    answer?: string           // direct answer if nextAction=answer
}

// A single run = one user message + the full agent graph execution
export interface TeamRun {
    id: string
    teamId: string
    userMessage: string
    status: TeamRunStatus
    steps: number             // how many leader→delegate cycles happened
    maxSteps: number
    startedAt: string
    endedAt?: string
    error?: string
    messages: TeamMessage[]   // full conversation including streaming
    contextFiles: string[]    // which files were used as context
}

// Team-level conversation history (persisted, reused across runs)
export interface TeamConversation {
    teamId: string
    messages: Array<{ role: string; content: string; timestamp: string }>
}

// ─── Role tools ────────────────────────────────────────────────────────────
const ROLE_TOOLS: Record<TeamRole, BuiltinTool[]> = {
    leader: ['read_file', 'list_files', 'search_code'],
    analyst: ['read_file', 'list_files', 'search_code', 'grep'],
    developer: ['read_file', 'write_file', 'list_files', 'bash',
        'search_code', 'grep', 'git_status', 'git_diff', 'git_commit'],
    qa: ['read_file', 'list_files', 'bash', 'search_code',
        'grep', 'git_status', 'git_diff'],
}

// ─── System prompts ────────────────────────────────────────────────────────
const LEADER_SYSTEM = `You are the Team Leader AI. You are the central decision-maker for this team.

TEAM MEMBERS you can delegate to:
- analyst: understands requirements, identifies edge cases, writes specs
- developer: reads and writes code, runs bash, modifies files
- qa: reads code, runs tests, reports defects

YOUR DECISION PROCESS:
1. Read the user's message and conversation history carefully
2. Decide what to do next
3. Respond ONLY with valid JSON — no prose, no markdown fences

OUTPUT SCHEMA:
{
  "reasoning": "<1-3 sentences explaining your decision>",
  "next_action": "answer" | "analyst" | "developer" | "qa" | "done",
  "instruction": "<precise task for the chosen agent, or empty if answer/done>",
  "answer": "<your direct response to the user, only when next_action is answer>"
}

ROUTING RULES:
- "answer" — simple questions, greetings, clarifications, anything you can answer directly
- "analyst" — before development when requirements need clarification
- "developer" — when code needs to be written, modified, or debugged
- "qa" — after developer makes changes, to verify correctness
- "done" — when the task is fully complete and verified

IMPORTANT: You will be called multiple times in a single task. Each time you receive
the outputs from the previous agent. Decide whether the task is done or if another
agent is needed. You ALWAYS have the final say.`

const ANALYST_SYSTEM = `You are the Business Analyst AI. You receive precise instructions from the Team Leader.

Your job: Translate the leader's instruction into structured requirements.
Read existing code using read_file to understand current patterns.

ALWAYS respond with ONLY valid JSON, no markdown fences:
{
  "requirements": {
    "functional": ["<requirement>", ...],
    "non_functional": ["<perf/security>", ...],
    "edge_cases": ["<edge case>", ...],
    "test_scenarios": [
      { "scenario": "<desc>", "steps": "<how to test>", "expected": "<result>" }
    ],
    "existing_patterns": ["<pattern observed in code>", ...]
  },
  "summary": "<2 sentence summary for the developer>"
}`

const DEVELOPER_SYSTEM = `You are the Developer AI. You receive precise instructions from the Team Leader.

MANDATORY RULES:
1. Use read_file on EVERY file before modifying it — no exceptions
2. Match existing code style exactly — read the file first
3. Use bash to run tests/lint after changes
4. Report EVERY file you changed, created, or deleted

ALWAYS respond with ONLY valid JSON after completing your work:
{
  "implementation": {
    "files_modified": ["<path>", ...],
    "files_created": ["<path>", ...],
    "files_deleted": ["<path>", ...],
    "summary": "<what was implemented>",
    "commands_run": ["<command and its output>", ...],
    "known_issues": ["<anything incomplete>"]
  }
}`

const QA_SYSTEM = `You are the QA Engineer AI. You receive precise instructions from the Team Leader.

MANDATORY RULES:
1. Use read_file on every file listed in the implementation report
2. Run tests with bash — never skip this
3. Verify each stated requirement against actual code
4. Set "passed" true ONLY when you have verified every criterion

ALWAYS respond with ONLY valid JSON:
{
  "qa_report": {
    "passed": <true|false>,
    "criteria_results": [
      { "criterion": "<text>", "passed": <true|false>, "evidence": "<what you checked>" }
    ],
    "defects": [
      {
        "id": "<id>",
        "severity": "critical|major|minor",
        "description": "<problem>",
        "file": "<path or null>",
        "line": <number or null>
      }
    ],
    "test_output": "<raw output>",
    "recommendation": "APPROVE|REWORK"
  }
}`

const ROLE_SYSTEMS: Record<TeamRole, string> = {
    leader: LEADER_SYSTEM,
    analyst: ANALYST_SYSTEM,
    developer: DEVELOPER_SYSTEM,
    qa: QA_SYSTEM,
}

// ─── TeamManager ───────────────────────────────────────────────────────────
export class TeamManager extends EventEmitter {
    private abortControllers = new Map<string, AbortController>()
    // In-memory conversation histories per team (persisted to DB)
    private conversations = new Map<string, TeamConversation>()

    constructor(
        private db: DatabaseManager,
        private agents: AgentManager,
        private context: WorkspaceContextManager,
    ) {
        super()
        this.migrate()
    }

    // ─── Schema ───────────────────────────────────────────────────────────────
    private migrate(): void {
        this.db.run(`CREATE TABLE IF NOT EXISTS teams (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      session_id   TEXT NOT NULL,
      members      TEXT NOT NULL DEFAULT '[]',
      max_steps    INTEGER NOT NULL DEFAULT 12,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    )`)
        this.db.run(`CREATE TABLE IF NOT EXISTS team_runs (
      id           TEXT PRIMARY KEY,
      team_id      TEXT NOT NULL,
      user_message TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'idle',
      steps        INTEGER NOT NULL DEFAULT 0,
      max_steps    INTEGER NOT NULL DEFAULT 12,
      started_at   TEXT NOT NULL,
      ended_at     TEXT,
      error        TEXT,
      messages     TEXT NOT NULL DEFAULT '[]',
      context_files TEXT NOT NULL DEFAULT '[]'
    )`)
        this.db.run(`CREATE TABLE IF NOT EXISTS team_conversations (
      team_id  TEXT PRIMARY KEY,
      messages TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    )`)
    }

    // ─── Team CRUD ─────────────────────────────────────────────────────────────
    createTeam(data: {
        name: string; workspaceId: string; sessionId: string
        members: TeamMemberConfig[]; maxSteps?: number
    }): TeamConfig {
        const now = new Date().toISOString()
        const t: TeamConfig = {
            id: uuid(), name: data.name, workspaceId: data.workspaceId,
            sessionId: data.sessionId, members: data.members,
            maxSteps: data.maxSteps ?? 12, createdAt: now, updatedAt: now,
        }
        this.db.run(
            `INSERT INTO teams (id,name,workspace_id,session_id,members,max_steps,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
            [t.id, t.name, t.workspaceId, t.sessionId,
            JSON.stringify(t.members), t.maxSteps, now, now],
        )
        return t
    }

    updateTeam(id: string, patch: Partial<Pick<TeamConfig, 'name' | 'maxSteps' | 'members'>>): void {
        const now = new Date().toISOString()
        if (patch.name !== undefined) this.db.run('UPDATE teams SET name=?,updated_at=? WHERE id=?', [patch.name, now, id])
        if (patch.maxSteps !== undefined) this.db.run('UPDATE teams SET max_steps=?,updated_at=? WHERE id=?', [patch.maxSteps, now, id])
        if (patch.members !== undefined) this.db.run('UPDATE teams SET members=?,updated_at=? WHERE id=?', [JSON.stringify(patch.members), now, id])
    }

    getTeam(id: string): TeamConfig | undefined {
        const r = this.db.get<Record<string, string>>('SELECT * FROM teams WHERE id = ?', [id])
        return r ? this.toTeam(r) : undefined
    }

    listTeams(sessionId?: string): TeamConfig[] {
        const [sql, p] = sessionId
            ? ['SELECT * FROM teams WHERE session_id = ? ORDER BY created_at DESC', [sessionId]]
            : ['SELECT * FROM teams ORDER BY created_at DESC', []]
        return this.db.all<Record<string, string>>(sql, p).map(r => this.toTeam(r))
    }

    deleteTeam(id: string): void {
        this.db.run('DELETE FROM team_runs WHERE team_id = ?', [id])
        this.db.run('DELETE FROM team_conversations WHERE team_id = ?', [id])
        this.db.run('DELETE FROM teams WHERE id = ?', [id])
        this.conversations.delete(id)
    }

    // ─── Runs ─────────────────────────────────────────────────────────────────
    getRun(id: string): TeamRun | undefined {
        const r = this.db.get<Record<string, string>>('SELECT * FROM team_runs WHERE id = ?', [id])
        return r ? this.toRun(r) : undefined
    }

    listRuns(teamId: string): TeamRun[] {
        return this.db.all<Record<string, string>>(
            'SELECT * FROM team_runs WHERE team_id = ? ORDER BY started_at DESC LIMIT 50',
            [teamId],
        ).map(r => this.toRun(r))
    }

    clearHistory(teamId: string): void {
        this.conversations.delete(teamId)
        this.db.run('DELETE FROM team_conversations WHERE team_id = ?', [teamId])
    }

    // ─── Conversation history ─────────────────────────────────────────────────
    getConversation(teamId: string): TeamConversation {
        if (this.conversations.has(teamId)) return this.conversations.get(teamId)!
        const r = this.db.get<{ messages: string }>('SELECT messages FROM team_conversations WHERE team_id = ?', [teamId])
        const conv: TeamConversation = {
            teamId,
            messages: r ? JSON.parse(r.messages) : [],
        }
        this.conversations.set(teamId, conv)
        return conv
    }

    private saveConversation(conv: TeamConversation): void {
        const now = new Date().toISOString()
        const exists = this.db.get('SELECT team_id FROM team_conversations WHERE team_id = ?', [conv.teamId])
        if (exists) {
            this.db.run('UPDATE team_conversations SET messages=?,updated_at=? WHERE team_id=?',
                [JSON.stringify(conv.messages), now, conv.teamId])
        } else {
            this.db.run('INSERT INTO team_conversations (team_id,messages,updated_at) VALUES (?,?,?)',
                [conv.teamId, JSON.stringify(conv.messages), now])
        }
    }

    // ─── Agent factory ─────────────────────────────────────────────────────────
    async createTeamAgents(params: {
        name: string; workspaceId: string; sessionId: string
        provider: string; model: string; leaderModel?: string; maxSteps?: number
    }): Promise<TeamConfig> {
        const members: TeamMemberConfig[] = []
        const roleNames: Record<TeamRole, string> = {
            leader: 'Team Leader', analyst: 'Business Analyst',
            developer: 'Developer', qa: 'QA Engineer',
        }

        for (const role of ['leader', 'analyst', 'developer', 'qa'] as TeamRole[]) {
            const model = (role === 'leader' && params.leaderModel) ? params.leaderModel : params.model
            const agent = await this.agents.create({
                name: roleNames[role],
                provider: params.provider as import('../../shared/types').AIProvider,
                model,
                workspaceId: params.workspaceId,
                sessionId: params.sessionId,
                prompt: ROLE_SYSTEMS[role],
                tools: ROLE_TOOLS[role],
                tags: ['team', role],
            })
            members.push({ role, name: agent.name, agentId: agent.id, model, provider: params.provider })
        }

        const team = this.createTeam({
            name: params.name, workspaceId: params.workspaceId,
            sessionId: params.sessionId, members, maxSteps: params.maxSteps ?? 12,
        })

        // Index ONCE at creation. Never auto-re-index.
        const wsPath = await this.workspacePath(team.workspaceId)
        if (wsPath && !this.context.getStats(team.workspaceId)) {
            this.context.indexWorkspace(team.workspaceId, wsPath).catch(e =>
                logger.warn(`[Team] Background index failed: ${e}`)
            )
        }

        return team
    }

    // ─── Main entry: send a message to the team ───────────────────────────────
    async sendMessage(
        teamId: string,
        userMessage: string,
        contextFiles?: string[],   // optional: specific files to include in context
    ): Promise<TeamRun> {
        const team = this.getTeam(teamId)
        if (!team) throw new Error(`Team ${teamId} not found`)

        const run: TeamRun = {
            id: uuid(), teamId, userMessage, status: 'idle', steps: 0,
            maxSteps: team.maxSteps, startedAt: new Date().toISOString(),
            messages: [], contextFiles: contextFiles ?? [],
        }
        this.saveRun(run)

        const ctrl = new AbortController()
        this.abortControllers.set(run.id, ctrl)

        // Add user message to conversation history
        const conv = this.getConversation(teamId)
        conv.messages.push({ role: 'user', content: userMessage, timestamp: run.startedAt })
        this.saveConversation(conv)

        // Append user message to run
        const userMsg: TeamMessage = {
            id: uuid(), role: 'user', content: userMessage,
            streaming: false, timestamp: run.startedAt,
        }
        run.messages.push(userMsg)
        this.emit('run:message', { runId: run.id, message: userMsg })

        // Fire async loop
        this.leaderLoop(team, run, conv, ctrl.signal).catch(err => {
            const msg = err instanceof Error ? err.message : String(err)
            logger.error(`[Team] Run ${run.id} error: ${msg}`)
            run.status = 'error'; run.error = msg
            run.endedAt = new Date().toISOString()
            this.saveRun(run)
            this.abortControllers.delete(run.id)
            this.emit('run:end', run)
        })

        return run
    }

    stopRun(runId: string): void {
        this.abortControllers.get(runId)?.abort()
        this.abortControllers.delete(runId)
        const run = this.getRun(runId)
        if (run && !['done', 'error', 'max_steps'].includes(run.status)) {
            run.status = 'error'; run.error = 'Stopped by user'
            run.endedAt = new Date().toISOString()
            this.saveRun(run); this.emit('run:end', run)
        }
    }

    // ─── Leader-centric loop ──────────────────────────────────────────────────
    //
    // The leader is called in a loop. Each iteration:
    //  1. Build context for leader (history + last agent output + workspace ctx)
    //  2. Call leader → get LeaderDecision JSON
    //  3. If next_action=answer or done → end
    //  4. Otherwise → call the designated agent → pass output back to leader
    //  5. Repeat
    //
    private async leaderLoop(
        team: TeamConfig,
        run: TeamRun,
        conv: TeamConversation,
        signal: AbortSignal,
    ): Promise<void> {
        const leader = team.members.find(m => m.role === 'leader')!
        const analyst = team.members.find(m => m.role === 'analyst')
        const developer = team.members.find(m => m.role === 'developer')
        const qa = team.members.find(m => m.role === 'qa')

        // Get workspace context (uses index if available, doesn't rebuild)
        const wsCtx = await this.context.getContextSummary(
            team.workspaceId,
            run.userMessage,
            run.contextFiles.length > 0 ? run.contextFiles : undefined,
        )

        let lastAgentOutput = ''   // output from most recent delegated agent
        let lastAgentRole: TeamRole | null = null

        while (run.steps < team.maxSteps) {
            if (signal.aborted) throw new Error('Stopped')
            run.steps++

            // ── Build leader prompt ──────────────────────────────────────────────
            const leaderPrompt = buildLeaderPrompt(
                run.userMessage,
                conv.messages.slice(-20),   // last 20 messages for context window
                wsCtx,
                lastAgentRole,
                lastAgentOutput,
            )

            // ── Call leader ───────────────────────────────────────────────────────
            this.setStatus(run, 'leader_thinking')
            const leaderRaw = await this.callAgent(
                leader.agentId, leaderPrompt, run.id, 'leader', signal,
            )

            const decision = parseLeaderDecision(leaderRaw)

            // Append leader message to run
            const leaderMsg: TeamMessage = {
                id: uuid(), role: 'leader', content: leaderRaw,
                streaming: false, timestamp: new Date().toISOString(),
                leaderDecision: decision,
            }
            run.messages.push(leaderMsg)
            this.saveRun(run)
            this.emit('run:message', { runId: run.id, message: leaderMsg })

            // ── Handle leader decision ─────────────────────────────────────────
            if (decision.nextAction === 'answer') {
                // Leader answers directly — no agents needed
                const answer = decision.answer ?? decision.reasoning
                const answerMsg: TeamMessage = {
                    id: uuid(), role: 'leader', content: answer,
                    streaming: false, timestamp: new Date().toISOString(),
                }
                run.messages.push(answerMsg)
                conv.messages.push({ role: 'assistant', content: answer, timestamp: answerMsg.timestamp })
                this.saveConversation(conv)
                this.saveRun(run)
                this.emit('run:message', { runId: run.id, message: answerMsg })
                break
            }

            if (decision.nextAction === 'done') {
                conv.messages.push({ role: 'assistant', content: decision.reasoning, timestamp: new Date().toISOString() })
                this.saveConversation(conv)
                break
            }

            // ── Delegate to a specialist ─────────────────────────────────────────
            const roleMap: Record<TeamRole, TeamMemberConfig | undefined> = {
                analyst,
                developer,
                qa,
                leader
            }
            const targetRole = decision.nextAction as TeamRole
            const targetMember = roleMap[targetRole]

            if (!targetMember) {
                logger.warn(`[Team] Leader wanted ${targetRole} but not in team, ending`)
                break
            }

            const statusMap: Record<string, TeamRunStatus> = {
                analyst: 'analyst_working', developer: 'developer_working', qa: 'qa_working',
            }
            this.setStatus(run, statusMap[targetRole] as TeamRunStatus)

            const agentPrompt = buildDelegatePrompt(
                targetRole,
                decision.instruction ?? run.userMessage,
                conv.messages.slice(-10),
                wsCtx,
            )

            const agentRaw = await this.callAgent(
                targetMember.agentId, agentPrompt, run.id, targetRole, signal,
            )

            // For developer: capture git diff
            let fileDiff: FileDiffSummary | undefined
            if (targetRole === 'developer') {
                fileDiff = await this.captureGitDiff(team.workspaceId)
            }

            const agentMsg: TeamMessage = {
                id: uuid(), role: targetRole, content: agentRaw,
                streaming: false, timestamp: new Date().toISOString(),
                fileDiff,
            }
            run.messages.push(agentMsg)
            conv.messages.push({ role: targetRole, content: agentRaw, timestamp: agentMsg.timestamp })
            this.saveConversation(conv)
            this.saveRun(run)
            this.emit('run:message', { runId: run.id, message: agentMsg })

            lastAgentOutput = agentRaw
            lastAgentRole = targetRole
        }

        // ── Finish ───────────────────────────────────────────────────────────────
        if (run.steps >= team.maxSteps && !['done', 'error'].includes(run.status)) {
            run.status = 'max_steps'
            run.error = `Reached max steps (${team.maxSteps})`
        } else {
            run.status = 'done'
        }
        run.endedAt = new Date().toISOString()
        this.saveRun(run)
        this.abortControllers.delete(run.id)
        this.emit('run:end', run)
        logger.info(`[Team] Run ${run.id} ended: ${run.status} (${run.steps} steps)`)
    }

    // ─── Call agent and await full turn ──────────────────────────────────────
    //
    // Registers turn:done / turn:error BEFORE sendMessage() to avoid race.
    // Emits streaming chunks in real-time via run:chunk events.
    //
    private callAgent(
        agentId: string,
        message: string,
        runId: string,
        role: TeamRole,
        signal: AbortSignal,
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            if (signal.aborted) { reject(new Error('Stopped')); return }

            let done = false
            const TIMEOUT = 5 * 60_000

            // Track streaming for this run so UI can show live thinking
            const onChunk = (d: unknown) => {
                const x = d as { agentId: string; chunk?: string; msgId?: string }
                if (x.agentId !== agentId) return
                if (x.chunk) {
                    this.emit('run:chunk', { runId, role, chunk: x.chunk })
                }
            }

            const cleanup = () => {
                clearTimeout(timer)
                this.agents.off('turn:done', onDone)
                this.agents.off('turn:error', onErr)
                signal.removeEventListener('abort', onAbort)
                // Remove chunk listener via the window push mechanism — we can't
                // directly unlisten push, but it's filtered by agentId so OK
            }

            const onDone = (id: string) => {
                if (id !== agentId || done) return
                done = true; cleanup()
                const msgs = this.agents.getMessages(agentId)
                const last = [...msgs].reverse().find(m => m.role === 'assistant')
                resolve(last?.content ?? '{}')
            }

            const onErr = (id: string, err: string) => {
                if (id !== agentId || done) return
                done = true; cleanup()
                reject(new Error(err))
            }

            const onAbort = () => {
                if (done) return
                done = true; cleanup()
                reject(new Error('Stopped'))
            }

            const timer = setTimeout(() => {
                if (done) return
                done = true; cleanup()
                reject(new Error(`Agent ${agentId} timed out`))
            }, TIMEOUT)

            this.agents.on('turn:done', onDone)
            this.agents.on('turn:error', onErr)
            signal.addEventListener('abort', onAbort)

            this.agents.sendMessage(agentId, message).catch(err => {
                if (done) return
                done = true; cleanup()
                reject(err)
            })
        })
    }

    // ─── Git diff capture ─────────────────────────────────────────────────────
    private async captureGitDiff(workspaceId: string): Promise<FileDiffSummary | undefined> {
        try {
            const wsPath = await this.workspacePath(workspaceId)
            if (!wsPath) return undefined

            const { execFile } = await import('child_process')
            const { promisify } = await import('util')
            const exec = promisify(execFile)

            const [statusResult, diffResult] = await Promise.all([
                exec('git', ['diff', '--stat', 'HEAD'], { cwd: wsPath, timeout: 10_000 }).catch(() => ({ stdout: '' })),
                exec('git', ['diff', 'HEAD'], { cwd: wsPath, timeout: 10_000 }).catch(() => ({ stdout: '' })),
            ])

            const stat = statusResult.stdout?.trim() ?? ''
            const rawDiff = diffResult.stdout?.trim() ?? ''
            if (!stat && !rawDiff) return undefined

            // Parse stat summary: "3 files changed, 42 insertions(+), 8 deletions(-)"
            const filesMatch = stat.match(/(\d+) files? changed/)
            const addMatch = stat.match(/(\d+) insertions?\(\+\)/)
            const delMatch = stat.match(/(\d+) deletions?\(-\)/)

            const changedFiles = [...stat.matchAll(/^\s*(.+)\s*\|/mg)].map(m => m[1].trim())

            return {
                filesChanged: changedFiles.filter(Boolean),
                additions: addMatch ? parseInt(addMatch[1]) : 0,
                deletions: delMatch ? parseInt(delMatch[1]) : 0,
                rawDiff: rawDiff.slice(0, 8000),  // cap at 8KB
            }
        } catch {
            return undefined
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────
    private setStatus(run: TeamRun, status: TeamRunStatus): void {
        run.status = status; this.saveRun(run)
        this.emit('run:status', { runId: run.id, status })
    }

    private async workspacePath(id: string): Promise<string | null> {
        const r = this.db.get<{ path: string }>('SELECT path FROM workspaces WHERE id = ?', [id])
        return r?.path ?? null
    }

    private saveRun(run: TeamRun): void {
        const exists = this.db.get('SELECT id FROM team_runs WHERE id = ?', [run.id])
        const msgsJson = JSON.stringify(run.messages)
        const ctxJson = JSON.stringify(run.contextFiles)
        if (exists) {
            this.db.run(
                `UPDATE team_runs SET status=?,steps=?,ended_at=?,error=?,messages=?,context_files=? WHERE id=?`,
                [run.status, run.steps, run.endedAt ?? null, run.error ?? null, msgsJson, ctxJson, run.id],
            )
        } else {
            this.db.run(
                `INSERT INTO team_runs
         (id,team_id,user_message,status,steps,max_steps,started_at,ended_at,error,messages,context_files)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
                [run.id, run.teamId, run.userMessage, run.status, run.steps, run.maxSteps,
                run.startedAt, run.endedAt ?? null, run.error ?? null, msgsJson, ctxJson],
            )
        }
    }

    private toTeam(r: Record<string, string>): TeamConfig {
        return {
            id: r.id, name: r.name, workspaceId: r.workspace_id, sessionId: r.session_id,
            members: JSON.parse(r.members ?? '[]'), maxSteps: Number(r.max_steps ?? 12),
            createdAt: r.created_at, updatedAt: r.updated_at,
        }
    }

    private toRun(r: Record<string, string>): TeamRun {
        return {
            id: r.id, teamId: r.team_id, userMessage: r.user_message,
            status: r.status as TeamRunStatus, steps: Number(r.steps ?? 0),
            maxSteps: Number(r.max_steps ?? 12), startedAt: r.started_at,
            endedAt: r.ended_at ?? undefined, error: r.error ?? undefined,
            messages: JSON.parse(r.messages ?? '[]'),
            contextFiles: JSON.parse(r.context_files ?? '[]'),
        }
    }
}

// ─── Prompt builders ───────────────────────────────────────────────────────
function buildLeaderPrompt(
    userMessage: string,
    history: Array<{ role: string; content: string; timestamp: string }>,
    wsCtx: string,
    lastRole: TeamRole | null,
    lastOutput: string,
): string {
    const historyText = history.length > 1
        ? `CONVERSATION HISTORY (last ${history.length} messages):\n` +
        history.slice(0, -1).map(m => `[${m.role}]: ${m.content.slice(0, 400)}`).join('\n') +
        '\n\n'
        : ''

    const agentResultText = lastRole && lastOutput
        ? `RESULT FROM ${lastRole.toUpperCase()}:\n${lastOutput.slice(0, 3000)}\n\n`
        : ''

    return `${historyText}USER MESSAGE: ${userMessage}\n\n` +
        `WORKSPACE CONTEXT:\n${wsCtx}\n\n` +
        agentResultText +
        `Decide what to do next. Respond ONLY with valid JSON.`
}

function buildDelegatePrompt(
    role: TeamRole,
    instruction: string,
    history: Array<{ role: string; content: string; timestamp: string }>,
    wsCtx: string,
): string {
    const historyText = history.length
        ? `RECENT CONTEXT:\n${history.map(m => `[${m.role}]: ${m.content.slice(0, 300)}`).join('\n')}\n\n`
        : ''

    return `${historyText}YOUR TASK (from Team Leader):\n${instruction}\n\n` +
        `WORKSPACE CONTEXT:\n${wsCtx}\n\n` +
        `Complete your task. Respond ONLY with valid JSON.`
}

// ─── Leader decision parser ────────────────────────────────────────────────
function parseLeaderDecision(raw: string): LeaderDecision {
    try {
        const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
        const start = clean.indexOf('{')
        if (start === -1) throw new Error('no JSON')
        const obj = JSON.parse(clean.slice(start))

        const validActions: LeaderAction[] = ['answer', 'analyst', 'developer', 'qa', 'done']
        const nextAction = validActions.includes(obj.next_action)
            ? obj.next_action as LeaderAction
            : 'answer'  // safe fallback

        return {
            nextAction,
            reasoning: String(obj.reasoning ?? ''),
            instruction: obj.instruction ? String(obj.instruction) : undefined,
            answer: obj.answer ? String(obj.answer) : undefined,
        }
    } catch (e) {
        // If we can't parse the leader output, treat it as a direct answer
        return { nextAction: 'answer', reasoning: raw, answer: raw }
    }
}
