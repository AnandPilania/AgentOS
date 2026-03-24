import * as pty from 'node-pty'
import { v4 as uuid } from 'uuid'
import os from 'os'
import type { TerminalSession } from '../../shared/types'
import { logger } from '../utils/logger'
import type { BrowserWindow } from 'electron'

interface PtySession {
    session: TerminalSession
    pty: pty.IPty
}

export class TerminalManager {
    private sessions = new Map<string, PtySession>()
    private windows: BrowserWindow[] = []

    setWindow(w: BrowserWindow) { this.windows = [w] }

    private push(channel: string, data: unknown) {
        this.windows.forEach(w => { if (!w.isDestroyed()) w.webContents.send(channel, data) })
    }

    create(data: { workspaceId: string; agentId?: string; cwd?: string }): TerminalSession {
        const shell = this.getShell()
        const args = this.getShellArgs()

        const p = pty.spawn(shell, args, {
            name: 'xterm-256color',
            cols: 120,
            rows: 40,
            cwd: data.cwd ?? os.homedir(),
            env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>,
        })

        const session: TerminalSession = {
            id: uuid(),
            agentId: data.agentId,
            workspaceId: data.workspaceId,
            pid: p.pid,
            alive: true,
            title: shell,
            createdAt: new Date().toISOString(),
        }

        p.onData(data => {
            this.push('terminal:output', { id: session.id, data })
        })

        p.onExit(() => {
            session.alive = false
            this.push('terminal:output', { id: session.id, data: '\r\n[Process exited]\r\n' })
        })

        this.sessions.set(session.id, { session, pty: p })
        logger.info(`Terminal created: ${session.id} (pid ${p.pid})`)
        return session
    }

    destroy(id: string): void {
        const s = this.sessions.get(id)
        if (s) {
            try { s.pty.kill() } catch {
                //
            }
            this.sessions.delete(id)
            logger.info(`Terminal destroyed: ${id}`)
        }
    }

    write(id: string, data: string): void {
        const s = this.sessions.get(id)
        if (s?.session.alive) s.pty.write(data)
    }

    resize(id: string, cols: number, rows: number): void {
        const s = this.sessions.get(id)
        if (s?.session.alive) s.pty.resize(cols, rows)
    }

    list(): TerminalSession[] {
        return [...this.sessions.values()].map(s => s.session)
    }

    destroyAll(): void {
        for (const id of this.sessions.keys()) this.destroy(id)
    }

    private getShell(): string {
        if (process.platform === 'win32') return 'powershell.exe'
        return process.env.SHELL ?? '/bin/bash'
    }

    private getShellArgs(): string[] {
        if (process.platform === 'win32') return []
        return ['--login']
    }
}
