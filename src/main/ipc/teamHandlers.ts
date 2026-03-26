/**
 * teamHandlers.ts  —  src/main/ipc/teamHandlers.ts
 *
 * Call registerTeamHandlers() from the bottom of allHandlers.ts:
 *
 *   import { registerTeamHandlers } from './teamHandlers'
 *   registerTeamHandlers(ipcMain, mainWindow!, teams, context, workspaces)
 */
import type { IpcMain, BrowserWindow } from 'electron'
import type { TeamManager } from '../managers/TeamManager'
import type { WorkspaceContextManager } from '../managers/WorkspaceContextManager'
import type { WorkspaceManager } from '../managers/WorkspaceManager'

export function registerTeamHandlers(
    ipc: IpcMain,
    win: BrowserWindow | null,
    teams: TeamManager,
    context: WorkspaceContextManager,
    workspaces: WorkspaceManager,
): void {

    // ── Team CRUD ──────────────────────────────────────────────────────────
    ipc.handle('team:list', (_, d) => teams.listTeams(d?.sessionId))
    ipc.handle('team:get', (_, id) => teams.getTeam(id))
    ipc.handle('team:delete', (_, id) => { teams.deleteTeam(id); return true })

    // Creates 4 agents + persists team + kicks off background indexing
    ipc.handle('team:create-agents', async (_, d: {
        name: string; workspaceId: string; sessionId: string
        provider: string; model: string; leaderModel?: string; maxRetries?: number
    }) => teams.createTeamAgents(d))

    // ── Run management ─────────────────────────────────────────────────────
    ipc.handle('team:run', (_, d: { teamId: string; task: string }) =>
        teams.runTeam(d.teamId, d.task))
    ipc.handle('team:stop-run', (_, runId: string) => { teams.stopRun(runId); return true })
    ipc.handle('team:list-runs', (_, teamId: string) => teams.listRuns(teamId))
    ipc.handle('team:get-run', (_, runId: string) => teams.getRun(runId))

    // ── RAG context ─────────────────────────────────────────────────────────
    ipc.handle('context:index', async (_, d: { workspaceId: string }) => {
        const ws = workspaces.get(d.workspaceId)
        if (!ws) throw new Error(`Workspace ${d.workspaceId} not found`)
        return context.indexWorkspace(d.workspaceId, ws.path)
    })
    ipc.handle('context:search', (_, d: { workspaceId: string; query: string; topK?: number }) =>
        context.search(d.workspaceId, d.query, d.topK))
    ipc.handle('context:stats', (_, workspaceId: string) => context.getStats(workspaceId))
    ipc.handle('context:clear', (_, workspaceId: string) => { context.clearIndex(workspaceId); return true })

    // ── Forward live events to renderer ────────────────────────────────────
    const fwd = (ev: string, data: unknown) => {
        if (win && !win.isDestroyed()) win.webContents.send(`team:${ev}`, data)
    }

    teams.on('run:start', d => fwd('run-start', d))
    teams.on('run:status', d => fwd('run-status', d))
    teams.on('run:cycle', d => fwd('run-cycle', d))
    teams.on('run:cycle:complete', d => fwd('run-cycle-complete', d))
    teams.on('run:end', d => fwd('run-end', d))

    context.on('index:start', d => fwd('context-index-start', d))
    context.on('index:done', d => fwd('context-index-done', d))
}
