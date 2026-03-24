import { v4 as uuid } from 'uuid'
import type { Session, PaneLayout, PaneConfig } from '../../shared/types'
import { DatabaseManager } from './DatabaseManager'
import { logger } from '../utils/logger'

export class SessionManager {
    constructor(private db: DatabaseManager) { }

    create(data: Partial<Session> & { workspaceId: string; userId: string; name: string }): Session {
        const now = new Date().toISOString()
        const session: Session = {
            id: uuid(),
            name: data.name,
            workspaceId: data.workspaceId,
            agentIds: data.agentIds ?? [],
            userId: data.userId,
            paneLayout: data.paneLayout ?? 'single',
            paneConfig: data.paneConfig ?? { panes: [{ id: uuid(), panel: 'chat', size: 100, position: 0 }] },
            createdAt: now,
            updatedAt: now,
            lastActiveAt: now,
            metadata: data.metadata ?? {},
        }

        this.db.run(
            `INSERT INTO sessions (id,name,workspace_id,agent_ids,user_id,pane_layout,pane_config,metadata,created_at,updated_at,last_active_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [session.id, session.name, session.workspaceId,
            JSON.stringify(session.agentIds), session.userId,
            session.paneLayout, JSON.stringify(session.paneConfig),
            JSON.stringify(session.metadata), session.createdAt, session.updatedAt, session.lastActiveAt]
        )
        logger.info(`Session created: ${session.id}`)
        return session
    }

    get(id: string): Session | undefined {
        const r = this.db.get<Record<string, string>>('SELECT * FROM sessions WHERE id = ?', [id])
        return r ? this.rowToSession(r) : undefined
    }

    list(userId: string): Session[] {
        return this.db.all<Record<string, string>>(
            'SELECT * FROM sessions WHERE user_id = ? ORDER BY last_active_at DESC', [userId]
        ).map(r => this.rowToSession(r))
    }

    update(id: string, patch: Partial<Session>): void {
        const now = new Date().toISOString()
        if (patch.paneLayout !== undefined) this.db.run('UPDATE sessions SET pane_layout=?,updated_at=? WHERE id=?', [patch.paneLayout, now, id])
        if (patch.paneConfig !== undefined) this.db.run('UPDATE sessions SET pane_config=?,updated_at=? WHERE id=?', [JSON.stringify(patch.paneConfig), now, id])
        if (patch.agentIds !== undefined) this.db.run('UPDATE sessions SET agent_ids=?,updated_at=? WHERE id=?', [JSON.stringify(patch.agentIds), now, id])
        if (patch.name !== undefined) this.db.run('UPDATE sessions SET name=?,updated_at=? WHERE id=?', [patch.name, now, id])
        this.db.run('UPDATE sessions SET last_active_at=? WHERE id=?', [now, id])
    }

    touch(id: string): void {
        this.db.run('UPDATE sessions SET last_active_at=? WHERE id=?', [new Date().toISOString(), id])
    }

    delete(id: string): void {
        this.db.run('DELETE FROM sessions WHERE id = ?', [id])
    }

    // ─── Pane helpers ────────────────────────────────────────
    addAgentToSession(sessionId: string, agentId: string): void {
        const session = this.get(sessionId)
        if (!session) return
        if (!session.agentIds.includes(agentId)) {
            this.update(sessionId, { agentIds: [...session.agentIds, agentId] })
        }
    }

    buildPaneConfig(layout: PaneLayout, agentIds: string[]): PaneConfig {
        const paneId = () => uuid()
        switch (layout) {
            case 'single': return { panes: [{ id: paneId(), agentId: agentIds[0], panel: 'chat', size: 100, position: 0 }] }
            case 'split-h': return {
                panes: [
                    { id: paneId(), agentId: agentIds[0], panel: 'chat', size: 50, position: 0 },
                    { id: paneId(), agentId: agentIds[1], panel: 'chat', size: 50, position: 1 },
                ]
            }
            case 'split-v': return {
                panes: [
                    { id: paneId(), agentId: agentIds[0], panel: 'chat', size: 50, position: 0 },
                    { id: paneId(), agentId: agentIds[1], panel: 'chat', size: 50, position: 1 },
                ]
            }
            case 'quad': return {
                panes: [
                    { id: paneId(), agentId: agentIds[0], panel: 'chat', size: 50, position: 0 },
                    { id: paneId(), agentId: agentIds[1], panel: 'chat', size: 50, position: 1 },
                    { id: paneId(), agentId: agentIds[2], panel: 'terminal', size: 50, position: 2 },
                    { id: paneId(), agentId: agentIds[3], panel: 'diff', size: 50, position: 3 },
                ]
            }
            default: return { panes: [] }
        }
    }

    private rowToSession(r: Record<string, string>): Session {
        return {
            id: r.id, name: r.name, workspaceId: r.workspace_id,
            agentIds: JSON.parse(r.agent_ids ?? '[]'), userId: r.user_id,
            paneLayout: r.pane_layout as PaneLayout,
            paneConfig: JSON.parse(r.pane_config ?? '{"panes":[]}'),
            createdAt: r.created_at, updatedAt: r.updated_at, lastActiveAt: r.last_active_at,
            metadata: JSON.parse(r.metadata ?? '{}'),
        }
    }
}
