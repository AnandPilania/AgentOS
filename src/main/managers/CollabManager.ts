import { Server as SocketServer } from 'socket.io'
import { EventEmitter } from 'eventemitter3'
import type { Server as HTTPServer } from 'http'
import type { CollabEvent, UserPresence } from '../../shared/types'
import { logger } from '../utils/logger'

export class CollabManager extends EventEmitter {
  private io?: SocketServer
  private presence = new Map<string, UserPresence>()

  // Presence colors assigned per user
  private readonly COLORS = [
    '#6355fa', '#ff26c5', '#00ff88', '#00aaff',
    '#ffdd00', '#ff7700', '#ff3355', '#00ffcc',
  ]
  private colorIdx = 0

  attach(server: HTTPServer): void {
    this.io = new SocketServer(server, {
      cors: { origin: '*', methods: ['GET', 'POST'] },
      transports: ['websocket', 'polling'],
    })

    this.io.on('connection', (socket) => {
      logger.info(`Collab client connected: ${socket.id}`)

      // ─── Auth ──────────────────────────────────────
      socket.on('auth', (data: { userId: string; name: string; sessionId: string }) => {
        const presence: UserPresence = {
          userId:    data.userId,
          name:      data.name,
          sessionId: data.sessionId,
          lastSeen:  new Date().toISOString(),
          color:     this.COLORS[this.colorIdx++ % this.COLORS.length],
        }
        this.presence.set(data.userId, presence)
        socket.join(`session:${data.sessionId}`)
        socket.data.userId    = data.userId
        socket.data.sessionId = data.sessionId

        // Broadcast presence to session
        this.io?.to(`session:${data.sessionId}`).emit('presence:join', presence)
        // Send existing presence list to new user
        const sessionPresence = [...this.presence.values()].filter(p => p.sessionId === data.sessionId)
        socket.emit('presence:list', sessionPresence)
      })

      // ─── Agent Events ──────────────────────────────
      socket.on('agent:update', (data: unknown) => {
        const sessionId = socket.data.sessionId
        if (!sessionId) return
        socket.to(`session:${sessionId}`).emit('agent:update', data)
      })

      // ─── Cursor / Selection ────────────────────────
      socket.on('cursor', (data: unknown) => {
        const sessionId = socket.data.sessionId
        if (!sessionId) return
        socket.to(`session:${sessionId}`).emit('cursor', {
          userId: socket.data.userId, ...data as object,
        })
      })

      // ─── Collab events ────────────────────────────
      socket.on('event', (event: CollabEvent) => {
        const sessionId = socket.data.sessionId
        if (!sessionId) return
        socket.to(`session:${sessionId}`).emit('event', event)
      })

      // ─── Heartbeat / presence update ───────────────
      socket.on('heartbeat', () => {
        const userId = socket.data.userId
        if (!userId) return
        const p = this.presence.get(userId)
        if (p) {
          p.lastSeen = new Date().toISOString()
          this.presence.set(userId, p)
        }
      })

      // ─── Disconnect ────────────────────────────────
      socket.on('disconnect', () => {
        const userId    = socket.data.userId
        const sessionId = socket.data.sessionId
        logger.info(`Collab client disconnected: ${socket.id}`)

        if (userId && sessionId) {
          this.presence.delete(userId)
          this.io?.to(`session:${sessionId}`).emit('presence:leave', { userId })
        }
      })
    })

    logger.info('Collab WebSocket server attached')
  }

  // ─── Broadcast from server ──────────────────────────────
  broadcastToSession(sessionId: string, event: string, data: unknown): void {
    this.io?.to(`session:${sessionId}`).emit(event, data)
  }

  getSessionPresence(sessionId: string): UserPresence[] {
    return [...this.presence.values()].filter(p => p.sessionId === sessionId)
  }

  // Clean stale presence (>60s no heartbeat)
  pruneStalePresence(): void {
    const cutoff = Date.now() - 60_000
    for (const [userId, p] of this.presence.entries()) {
      if (new Date(p.lastSeen).getTime() < cutoff) {
        this.presence.delete(userId)
        this.io?.to(`session:${p.sessionId}`).emit('presence:leave', { userId })
      }
    }
  }

  close(): void {
    this.io?.close()
  }
}
