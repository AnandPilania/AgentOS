import { v4 as uuid } from 'uuid'
import type { AuditEvent } from '../../shared/types'
import type { DatabaseManager } from './DatabaseManager'
import { logger } from '../utils/logger'

export class AuditManager {
  constructor(private db: DatabaseManager) {}

  log(event: Omit<AuditEvent, 'id' | 'timestamp'>): void {
    const e: AuditEvent = {
      ...event,
      id:        uuid(),
      timestamp: new Date().toISOString(),
    }
    try {
      this.db.run(
        `INSERT INTO audit_logs (id,user_id,team_id,action,resource,resource_id,metadata,ip,user_agent,severity,timestamp)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [e.id, e.userId, e.teamId ?? null, e.action, e.resource, e.resourceId,
         JSON.stringify(e.metadata), e.ip ?? null, e.userAgent ?? null, e.severity, e.timestamp]
      )
    } catch (err) {
      logger.error(`AuditManager.log failed: ${err}`)
    }
  }

  list(filters?: {
    userId?:  string
    teamId?:  string
    action?:  string
    resource?:string
    from?:    string
    to?:      string
    severity?:string
    limit?:   number
  }): AuditEvent[] {
    let sql = 'SELECT * FROM audit_logs WHERE 1=1'
    const params: unknown[] = []

    if (filters?.userId)   { sql += ' AND user_id = ?';         params.push(filters.userId) }
    if (filters?.teamId)   { sql += ' AND team_id = ?';         params.push(filters.teamId) }
    if (filters?.action)   { sql += ' AND action LIKE ?';       params.push(`%${filters.action}%`) }
    if (filters?.resource) { sql += ' AND resource = ?';        params.push(filters.resource) }
    if (filters?.severity) { sql += ' AND severity = ?';        params.push(filters.severity) }
    if (filters?.from)     { sql += ' AND timestamp >= ?';      params.push(filters.from) }
    if (filters?.to)       { sql += ' AND timestamp <= ?';      params.push(filters.to) }

    sql += ' ORDER BY timestamp DESC'
    sql += ` LIMIT ${Math.min(filters?.limit ?? 500, 5000)}`

    return this.db.all<Record<string, string>>(sql, params).map(r => ({
      id:         r.id,
      userId:     r.user_id,
      teamId:     r.team_id   ?? undefined,
      action:     r.action,
      resource:   r.resource,
      resourceId: r.resource_id,
      metadata:   JSON.parse(r.metadata ?? '{}'),
      ip:         r.ip        ?? undefined,
      userAgent:  r.user_agent?? undefined,
      severity:   r.severity as AuditEvent['severity'],
      timestamp:  r.timestamp,
    }))
  }

  export(filters?: Parameters<AuditManager['list']>[0]): string {
    return JSON.stringify(this.list(filters), null, 2)
  }

  purge(olderThanDays: number): number {
    const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString()
    const result = this.db.run('DELETE FROM audit_logs WHERE timestamp < ?', [cutoff])
    logger.info(`Audit purge: removed ${result.changes} entries older than ${olderThanDays} days`)
    return result.changes
  }
}
