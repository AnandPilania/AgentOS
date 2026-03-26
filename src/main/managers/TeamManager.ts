/**
 * Multi-agent team orchestration.
 *
 * Design:
 *  • Team Leader owns the task. It plans once, reviews every cycle, and
 *    the loop only exits when QA says APPROVE.
 *  • sendToAgent() awaits the FULL tool-use turn via 'turn:done' /
 *    'turn:error' events emitted by the patched AgentManager.
 *  • Works with Anthropic, OpenAI, Gemini, Ollama (kimi-k2, llama3.1,
 *    deepseek, qwen2.5-coder, phi4, etc.)
 */

import { v4 as uuid } from 'uuid'
import { EventEmitter } from 'eventemitter3'
import type { BuiltinTool } from '../../shared/types'
import type { AgentManager } from './AgentManager'
import type { DatabaseManager } from './DatabaseManager'
import type { WorkspaceContextManager } from './WorkspaceContextManager'
import { logger } from '../utils/logger'

// ─── Public types ──────────────────────────────────────────────────────────
export type TeamRole = 'leader' | 'analyst' | 'developer' | 'qa'

export type TeamRunStatus =
    | 'idle' | 'planning' | 'analyzing' | 'developing'
    | 'reviewing' | 'done' | 'error' | 'max_retries'

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
    maxRetries: number
    createdAt: string
    updatedAt: string
}

export interface TeamRun {
    id: string
    teamId: string
    task: string
    status: TeamRunStatus
    cycle: number
    maxRetries: number
    startedAt: string
    endedAt?: string
    error?: string
    history: TeamCycleRecord[]
    lastQaOutput?: string
    qaPassedAt?: number
}

export interface TeamCycleRecord {
    cycle: number
    leaderPlan: string
    analystOutput: string
    devOutput: string
    qaOutput: string
    qaPassed: boolean
    defects: ParsedDefect[]
    timestamp: string
}

export interface ParsedDefect {
    id: string
    severity: 'critical' | 'major' | 'minor'
    description: string
    file?: string
    line?: number
}

// ─── Role tools ────────────────────────────────────────────────────────────
const ROLE_TOOLS: Record<TeamRole, BuiltinTool[]> = {
    leader: ['read_file', 'list_files', 'search_code'],
    analyst: ['read_file', 'list_files', 'search_code', 'grep'],
    developer: ['read_file', 'write_file', 'list_files', 'bash', 'search_code',
        'grep', 'git_status', 'git_diff', 'git_commit'],
    qa: ['read_file', 'list_files', 'bash', 'search_code', 'grep',
        'git_status', 'git_diff'],
}

// ─── Role system prompts ───────────────────────────────────────────────────
const ROLE_PROMPTS: Record<TeamRole, string> = {
    leader: `You are the Team Leader AI. You own this task end-to-end.

Responsibilities:
- Decompose the task into clear sub-tasks for each role
- Define measurable acceptance criteria
- After each QA cycle, acknowledge defects and guide the next attempt

ALWAYS respond with ONLY valid JSON, no markdown fences, no prose outside JSON.

Output schema:
{
  "plan": {
    "objective": "<one sentence>",
    "acceptance_criteria": ["<testable criterion>", ...],
    "analyst_task": "<exact instructions for the analyst>",
    "developer_task": "<exact instructions, which files to create/modify>",
    "qa_task": "<what to test, what commands to run>",
    "context_hints": ["<relevant existing files or patterns>"]
  }
}`,

    analyst: `You are the Business Analyst AI. You receive instructions from the Team Leader.

Responsibilities:
- Translate leader instructions into detailed technical requirements
- Identify edge cases and constraints
- Define test scenarios for QA

ALWAYS respond with ONLY valid JSON, no markdown fences.

Output schema:
{
  "requirements": {
    "functional": ["<requirement>", ...],
    "non_functional": ["<perf/security/etc>", ...],
    "edge_cases": ["<edge case>", ...],
    "test_scenarios": [
      { "scenario": "<name>", "steps": "<how>", "expected": "<result>" }
    ]
  }
}`,

    developer: `You are the Developer AI. You receive a plan and requirements.

Rules:
1. Use read_file on EVERY file before modifying it — no exceptions
2. Match existing code style exactly
3. Use bash to run tests/lint after changes
4. Implement only what is described — no scope creep

ALWAYS respond with ONLY valid JSON after completing work.

Output schema:
{
  "implementation": {
    "files_modified": ["<path>", ...],
    "files_created": ["<path>", ...],
    "files_deleted": ["<path>", ...],
    "summary": "<2-3 sentences>",
    "commands_run": ["<command output snippet>", ...],
    "known_issues": ["<anything incomplete>"]
  }
}`,

    qa: `You are the QA Engineer AI. You verify the implementation against the plan.

Rules:
1. Use read_file on every file in the implementation report
2. Check each acceptance criterion against the actual code
3. Run tests with bash
4. Set "passed": true ONLY when every criterion is satisfied and tests pass

ALWAYS respond with ONLY valid JSON, no markdown fences.

Output schema:
{
  "qa_report": {
    "passed": <true|false>,
    "criteria_results": [
      { "criterion": "<text>", "passed": <true|false>, "evidence": "<what you checked>" }
    ],
    "defects": [
      {
        "id": "<short-id>",
        "severity": "critical|major|minor",
        "description": "<clear problem statement>",
        "file": "<path or null>",
        "line": <number or null>
      }
    ],
    "test_output": "<raw output or 'no tests found'>",
    "recommendation": "APPROVE|REWORK"
  }
}`,
}

// ─── TeamManager ───────────────────────────────────────────────────────────
export class TeamManager extends EventEmitter {
    private abortControllers = new Map<string, AbortController>()

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
      max_retries  INTEGER NOT NULL DEFAULT 3,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    )`)
        this.db.run(`CREATE TABLE IF NOT EXISTS team_runs (
      id             TEXT PRIMARY KEY,
      team_id        TEXT NOT NULL,
      task           TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'idle',
      cycle          INTEGER NOT NULL DEFAULT 0,
      max_retries    INTEGER NOT NULL DEFAULT 3,
      started_at     TEXT NOT NULL,
      ended_at       TEXT,
      error          TEXT,
      history        TEXT NOT NULL DEFAULT '[]',
      last_qa_output TEXT,
      qa_passed_at   INTEGER
    )`)
    }

    // ─── CRUD ─────────────────────────────────────────────────────────────────
    createTeam(data: {
        name: string; workspaceId: string; sessionId: string
        members: TeamMemberConfig[]; maxRetries?: number
    }): TeamConfig {
        const now = new Date().toISOString()
        const t: TeamConfig = {
            id: uuid(), name: data.name, workspaceId: data.workspaceId,
            sessionId: data.sessionId, members: data.members,
            maxRetries: data.maxRetries ?? 3, createdAt: now, updatedAt: now,
        }
        this.db.run(
            `INSERT INTO teams (id,name,workspace_id,session_id,members,max_retries,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
            [t.id, t.name, t.workspaceId, t.sessionId,
            JSON.stringify(t.members), t.maxRetries, now, now],
        )
        return t
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
        this.db.run('DELETE FROM teams WHERE id = ?', [id])
    }

    getRun(id: string): TeamRun | undefined {
        const r = this.db.get<Record<string, string>>('SELECT * FROM team_runs WHERE id = ?', [id])
        return r ? this.toRun(r) : undefined
    }

    listRuns(teamId: string): TeamRun[] {
        return this.db.all<Record<string, string>>(
            'SELECT * FROM team_runs WHERE team_id = ? ORDER BY started_at DESC LIMIT 30',
            [teamId],
        ).map(r => this.toRun(r))
    }

    // ─── Agent factory ────────────────────────────────────────────────────────
    async createTeamAgents(params: {
        name: string; workspaceId: string; sessionId: string
        provider: string; model: string; leaderModel?: string; maxRetries?: number
    }): Promise<TeamConfig> {
        const members: TeamMemberConfig[] = []
        for (const role of ['leader', 'analyst', 'developer', 'qa'] as TeamRole[]) {
            const model = (role === 'leader' && params.leaderModel) ? params.leaderModel : params.model
            const agent = await this.agents.create({
                name: {
                    leader: 'Team Leader', analyst: 'Business Analyst',
                    developer: 'Developer', qa: 'QA Engineer'
                }[role],
                provider: params.provider as import('../../shared/types').AIProvider,
                model,
                workspaceId: params.workspaceId,
                sessionId: params.sessionId,
                prompt: ROLE_PROMPTS[role],
                tools: ROLE_TOOLS[role],
                tags: ['team', role],
            })
            members.push({ role, name: agent.name, agentId: agent.id, model, provider: params.provider })
        }

        const team = this.createTeam({
            name: params.name, workspaceId: params.workspaceId,
            sessionId: params.sessionId, members, maxRetries: params.maxRetries ?? 3,
        })

        // Background index — don't block
        const wsPath = await this.workspacePath(team.workspaceId)
        if (wsPath) this.context.indexWorkspace(team.workspaceId, wsPath).catch(() => { })

        return team
    }

    // ─── Run ──────────────────────────────────────────────────────────────────
    async runTeam(teamId: string, task: string): Promise<TeamRun> {
        const team = this.getTeam(teamId)
        if (!team) throw new Error(`Team ${teamId} not found`)

        const run: TeamRun = {
            id: uuid(), teamId, task, status: 'idle',
            cycle: 0, maxRetries: team.maxRetries,
            startedAt: new Date().toISOString(), history: [],
        }
        this.save(run)

        const ctrl = new AbortController()
        this.abortControllers.set(run.id, ctrl)

        // Fire without await — IPC returns the initial run object immediately
        this.loop(team, run, ctrl.signal).catch(err => {
            run.status = 'error'
            run.error = err instanceof Error ? err.message : String(err)
            run.endedAt = new Date().toISOString()
            this.save(run)
            this.abortControllers.delete(run.id)
            this.emit('run:end', run)
        })

        return run
    }

    stopRun(runId: string): void {
        this.abortControllers.get(runId)?.abort()
        this.abortControllers.delete(runId)
        const run = this.getRun(runId)
        if (run && !['done', 'error', 'max_retries'].includes(run.status)) {
            run.status = 'error'; run.error = 'Stopped by user'
            run.endedAt = new Date().toISOString()
            this.save(run); this.emit('run:end', run)
        }
    }

    // ─── The loop ─────────────────────────────────────────────────────────────
    private async loop(team: TeamConfig, run: TeamRun, signal: AbortSignal): Promise<void> {
        this.requireRoles(team)
        const m = (role: TeamRole) => team.members.find(x => x.role === role)!

        // RAG context — fetched once, reused every cycle
        const wsCtx = await this.context.getContextSummary(team.workspaceId, run.task)

        // ── Leader plans (once) ────────────────────────────────────────────────
        this.status(run, 'planning'); this.emit('run:start', run)

        const leaderPlan = await this.call(
            m('leader').agentId,
            `You are the Team Leader. You own this task completely.\n\n` +
            `TASK:\n${run.task}\n\n` +
            `WORKSPACE CONTEXT:\n${wsCtx}\n\n` +
            `Create a detailed plan. Respond ONLY with valid JSON.`,
            signal,
        )

        let defects: ParsedDefect[] = []
        let passed = false

        // ── Retry loop ─────────────────────────────────────────────────────────
        while (!passed && run.cycle < team.maxRetries) {
            if (signal.aborted) throw new Error('Stopped')
            run.cycle++
            this.save(run)
            this.emit('run:cycle', { runId: run.id, cycle: run.cycle })

            // Analyst
            this.status(run, 'analyzing')
            const analystOut = await this.call(
                m('analyst').agentId,
                buildAnalystPrompt(leaderPlan, wsCtx, defects, run.cycle),
                signal,
            )

            // Developer
            this.status(run, 'developing')
            const devOut = await this.call(
                m('developer').agentId,
                buildDevPrompt(leaderPlan, analystOut, defects, run.cycle),
                signal,
            )

            // QA
            this.status(run, 'reviewing')
            const qaOut = await this.call(
                m('qa').agentId,
                buildQAPrompt(leaderPlan, analystOut, devOut),
                signal,
            )

            const qa = parseQA(qaOut)
            passed = qa.passed
            defects = qa.defects
            run.lastQaOutput = qaOut
            if (passed) run.qaPassedAt = run.cycle

            // Leader reviews the cycle (best-effort, non-blocking)
            if (!passed && run.cycle < team.maxRetries) {
                this.call(
                    m('leader').agentId,
                    `Cycle ${run.cycle} QA FAILED.\n\nDefects:\n` +
                    defects.map(d => `[${d.severity}] ${d.description}`).join('\n') +
                    `\n\nAcknowledge and state what the next cycle must prioritize.\n` +
                    `Respond with JSON: { "review": { "acknowledged": true, "priority": "<key fix>" } }`,
                    signal,
                ).catch(() => { })
            }

            const record: TeamCycleRecord = {
                cycle: run.cycle, leaderPlan, analystOutput: analystOut,
                devOutput: devOut, qaOutput: qaOut, qaPassed: passed,
                defects, timestamp: new Date().toISOString(),
            }
            run.history.push(record)
            this.save(run)
            this.emit('run:cycle:complete', { runId: run.id, cycle: run.cycle, passed, defects })
        }

        // ── Finish ────────────────────────────────────────────────────────────
        run.status = passed ? 'done' : 'max_retries'
        run.endedAt = new Date().toISOString()
        if (!passed) {
            run.error = `QA did not pass after ${team.maxRetries} retries.\n` +
                defects.map(d => `[${d.severity}] ${d.description}`).join('\n')
        }
        this.save(run)
        this.abortControllers.delete(run.id)
        this.emit('run:end', run)
        logger.info(`[Team] Run ${run.id}: ${run.status} after ${run.cycle} cycle(s)`)
    }

    // ─── Core: await a complete agent turn ────────────────────────────────────
    //
    // WHY this approach:
    //   AgentManager.sendMessage() fires runWithRetry() WITHOUT await and returns
    //   immediately. The actual work (provider API calls + tool loops) runs in the
    //   background. runAgentTurn()'s finally block sets status='idle' AND emits
    //   'turn:done'. We register listeners BEFORE calling sendMessage() so we
    //   can never miss the event.
    //
    private call(agentId: string, message: string, signal: AbortSignal): Promise<string> {
        return new Promise((resolve, reject) => {
            if (signal.aborted) { reject(new Error('Stopped')); return }

            let done = false
            const TIMEOUT = 5 * 60_000  // 5 min

            const cleanup = () => {
                clearTimeout(timer)
                this.agents.off('turn:done', onDone)
                this.agents.off('turn:error', onErr)
                signal.removeEventListener('abort', onAbort)
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
                reject(new Error(`Agent ${agentId} timed out after ${TIMEOUT / 1000}s`))
            }, TIMEOUT)

            // Attach BEFORE calling sendMessage
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

    // ─── Helpers ──────────────────────────────────────────────────────────────
    private status(run: TeamRun, s: TeamRunStatus): void {
        run.status = s; this.save(run)
        this.emit('run:status', { runId: run.id, status: s })
    }

    private requireRoles(team: TeamConfig): void {
        for (const r of ['leader', 'analyst', 'developer', 'qa'] as TeamRole[]) {
            if (!team.members.find(m => m.role === r))
                throw new Error(`Team ${team.id} missing role: ${r}`)
        }
    }

    private async workspacePath(id: string): Promise<string | null> {
        const r = this.db.get<{ path: string }>('SELECT path FROM workspaces WHERE id = ?', [id])
        return r?.path ?? null
    }

    private save(run: TeamRun): void {
        const exists = this.db.get('SELECT id FROM team_runs WHERE id = ?', [run.id])
        if (exists) {
            this.db.run(
                `UPDATE team_runs SET status=?,cycle=?,ended_at=?,error=?,
         history=?,last_qa_output=?,qa_passed_at=? WHERE id=?`,
                [run.status, run.cycle, run.endedAt ?? null, run.error ?? null,
                JSON.stringify(run.history), run.lastQaOutput ?? null,
                run.qaPassedAt ?? null, run.id],
            )
        } else {
            this.db.run(
                `INSERT INTO team_runs
         (id,team_id,task,status,cycle,max_retries,started_at,ended_at,error,
          history,last_qa_output,qa_passed_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
                [run.id, run.teamId, run.task, run.status, run.cycle, run.maxRetries,
                run.startedAt, run.endedAt ?? null, run.error ?? null,
                JSON.stringify(run.history), run.lastQaOutput ?? null, run.qaPassedAt ?? null],
            )
        }
    }

    private toTeam(r: Record<string, string>): TeamConfig {
        return {
            id: r.id, name: r.name, workspaceId: r.workspace_id, sessionId: r.session_id,
            members: JSON.parse(r.members ?? '[]'), maxRetries: Number(r.max_retries ?? 3),
            createdAt: r.created_at, updatedAt: r.updated_at,
        }
    }

    private toRun(r: Record<string, string>): TeamRun {
        return {
            id: r.id, teamId: r.team_id, task: r.task, status: r.status as TeamRunStatus,
            cycle: Number(r.cycle ?? 0), maxRetries: Number(r.max_retries ?? 3),
            startedAt: r.started_at, endedAt: r.ended_at ?? undefined, error: r.error ?? undefined,
            history: JSON.parse(r.history ?? '[]'), lastQaOutput: r.last_qa_output ?? undefined,
            qaPassedAt: r.qa_passed_at ? Number(r.qa_passed_at) : undefined,
        }
    }
}

// ─── Prompt builders (pure functions) ─────────────────────────────────────
function buildAnalystPrompt(
    leaderPlan: string, wsCtx: string, defects: ParsedDefect[], cycle: number,
): string {
    const defSec = defects.length
        ? `\nDEFECTS FROM PREVIOUS CYCLE:\n${defects.map(d =>
            `  [${d.severity}] ${d.description}${d.file ? ` — ${d.file}` : ''}`).join('\n')}\n`
        : ''
    return `You are the Business Analyst. Cycle ${cycle}.\n\n` +
        `LEADER PLAN:\n${leaderPlan}\n` +
        defSec +
        `WORKSPACE CONTEXT:\n${wsCtx}\n\n` +
        `${cycle > 1 ? 'Focus requirements on the defects above.' : ''}\n` +
        `Respond ONLY with valid JSON.`
}

function buildDevPrompt(
    leaderPlan: string, analystOut: string, defects: ParsedDefect[], cycle: number,
): string {
    const defSec = defects.length
        ? `\nDEFECTS TO FIX:\n${defects.map(d =>
            `  [${d.severity}] ${d.description}${d.file ? ` in ${d.file}` : ''}${d.line ? ` line ${d.line}` : ''}`
        ).join('\n')}\n`
        : ''
    return `You are the Developer. Cycle ${cycle}.\n\n` +
        `LEADER PLAN:\n${leaderPlan}\n\n` +
        `REQUIREMENTS:\n${analystOut}\n` +
        defSec +
        `Use read_file before modifying any file. Run bash to verify changes.\n` +
        `Respond ONLY with valid JSON after completing your work.`
}

function buildQAPrompt(leaderPlan: string, analystOut: string, devOut: string): string {
    return `You are the QA Engineer.\n\n` +
        `LEADER PLAN (acceptance criteria):\n${leaderPlan}\n\n` +
        `REQUIREMENTS:\n${analystOut}\n\n` +
        `IMPLEMENTATION:\n${devOut}\n\n` +
        `Read every modified file. Run tests. Verify every criterion.\n` +
        `Respond ONLY with valid JSON.`
}

// ─── QA parser ────────────────────────────────────────────────────────────
function parseQA(raw: string): { passed: boolean; defects: ParsedDefect[] } {
    try {
        const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
        const start = clean.indexOf('{')
        if (start === -1) throw new Error('no JSON')
        const obj = JSON.parse(clean.slice(start))
        const report = obj.qa_report ?? obj
        const passed = Boolean(report.passed)
        const defects: ParsedDefect[] = (report.defects ?? []).map((d: Record<string, unknown>) => ({
            id: String(d.id ?? uuid()),
            severity: (['critical', 'major', 'minor'].includes(String(d.severity))
                ? d.severity : 'minor') as ParsedDefect['severity'],
            description: String(d.description ?? 'Unknown defect'),
            file: d.file ? String(d.file) : undefined,
            line: d.line != null ? Number(d.line) : undefined,
        }))
        return { passed, defects }
    } catch (e) {
        return {
            passed: false,
            defects: [{
                id: uuid(), severity: 'major',
                description: `QA output parse failed: ${String(e).slice(0, 120)}`
            }],
        }
    }
}
