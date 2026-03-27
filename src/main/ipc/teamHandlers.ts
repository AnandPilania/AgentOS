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

    const fwd = (ev: string, data: unknown) => {
        if (win && !win.isDestroyed()) win.webContents.send(`team:${ev}`, data)
    }

    // ── Team CRUD ─────────────────────────────────────────────────────────
    ipc.handle('team:list', (_, d) => teams.listTeams(d?.sessionId))
    ipc.handle('team:get', (_, id: string) => teams.getTeam(id))
    ipc.handle('team:delete', (_, id: string) => { teams.deleteTeam(id); return true })
    ipc.handle('team:update', (_, d: { id: string; patch: Parameters<typeof teams.updateTeam>[1] }) => {
        teams.updateTeam(d.id, d.patch); return true
    })
    ipc.handle('team:create-agents', async (_, d: {
        name: string; workspaceId: string; sessionId: string
        provider: string; model: string; leaderModel?: string; maxSteps?: number
    }) => teams.createTeamAgents(d))

    // ── Messaging ─────────────────────────────────────────────────────────
    ipc.handle('team:send', async (_, d: { teamId: string; message: string; contextFiles?: string[] }) =>
        teams.sendMessage(d.teamId, d.message, d.contextFiles))
    ipc.handle('team:stop-run', (_, runId: string) => { teams.stopRun(runId); return true })
    ipc.handle('team:list-runs', (_, teamId: string) => teams.listRuns(teamId))
    ipc.handle('team:get-run', (_, runId: string) => teams.getRun(runId))
    ipc.handle('team:get-conversation', (_, teamId: string) => teams.getConversation(teamId))
    ipc.handle('team:clear-history', (_, teamId: string) => { teams.clearHistory(teamId); return true })

    // ── RAG / Context ─────────────────────────────────────────────────────
    ipc.handle('context:index', async (_, d: { workspaceId: string; force?: boolean }) => {
        const ws = workspaces.get(d.workspaceId)
        if (!ws) throw new Error(`Workspace ${d.workspaceId} not found`)
        return context.indexWorkspace(d.workspaceId, ws.path, d.force)
    })
    ipc.handle('context:search', (_, d: { workspaceId: string; query: string; topK?: number }) =>
        context.search(d.workspaceId, d.query, d.topK))
    ipc.handle('context:stats', (_, workspaceId: string) => context.getStats(workspaceId))
    ipc.handle('context:clear', (_, workspaceId: string) => { context.clearIndex(workspaceId); return true })

    // ── Workspace browser ─────────────────────────────────────────────────
    // These are separate from the existing workspace:files IPC (which is per-agent)
    // These work directly off the workspace path without going through AgentManager.
    ipc.handle('ws:tree', async (_, d: { workspaceId: string; maxDepth?: number }) => {
        const ws = workspaces.get(d.workspaceId)
        if (!ws) throw new Error(`Workspace ${d.workspaceId} not found`)
        return context.getFileTree(ws.path, d.maxDepth)
    })
    ipc.handle('ws:read-file', async (_, d: { workspaceId: string; relPath: string }) => {
        const ws = workspaces.get(d.workspaceId)
        if (!ws) throw new Error(`Workspace ${d.workspaceId} not found`)
        return context.getFileContent(ws.path, d.relPath)
    })
    ipc.handle('ws:search-files', async (_, d: { workspaceId: string; pattern: string }) => {
        const ws = workspaces.get(d.workspaceId)
        if (!ws) throw new Error(`Workspace ${d.workspaceId} not found`)
        return context.searchFiles(ws.path, d.pattern)
    })

    // ── Live event forwarding ─────────────────────────────────────────────
    teams.on('run:status', d => fwd('run-status', d))
    teams.on('run:message', d => fwd('run-message', d))
    teams.on('run:chunk', d => fwd('run-chunk', d))    // streaming token
    teams.on('run:end', d => fwd('run-end', d))

    context.on('index:start', d => fwd('context-index-start', d))
    context.on('index:done', d => fwd('context-index-done', d))
}
