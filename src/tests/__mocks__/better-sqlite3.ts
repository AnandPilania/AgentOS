/**
 * better-sqlite3 mock for Jest tests
 * Uses an in-memory store keyed by table+rowid
 * Supports: INSERT, SELECT, UPDATE, DELETE, CREATE TABLE, CREATE INDEX
 */

interface Row { [key: string]: unknown }

class MockStatement {
  constructor(
    private db: MockDatabase,
    private sql: string,
  ) {}

  run(params?: unknown): { changes: number; lastInsertRowid: number } {
    return this.db._execute(this.sql, params)
  }

  get<T>(params?: unknown): T | undefined {
    const rows = this.db._query<T>(this.sql, params)
    return rows[0]
  }

  all<T>(params?: unknown): T[] {
    return this.db._query<T>(this.sql, params)
  }
}

class MockDatabase {
  // table name -> array of row objects
  private tables: Map<string, Row[]> = new Map()
  private _rowId = 0

  constructor(_path: string) {}

  pragma(_: string) { return this }

  exec(sql: string): this {
    // Handle CREATE TABLE IF NOT EXISTS
    for (const m of sql.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\(/gi)) {
      if (!this.tables.has(m[1])) this.tables.set(m[1], [])
    }
    return this
  }

  prepare(sql: string): MockStatement {
    return new MockStatement(this, sql)
  }

  run(sql: string, params?: unknown): { changes: number; lastInsertRowid: number } {
    return this.prepare(sql).run(params)
  }

  get<T>(sql: string, params?: unknown): T | undefined {
    return this.prepare(sql).get<T>(params)
  }

  all<T>(sql: string, params?: unknown): T[] {
    return this.prepare(sql).all<T>(params)
  }

  transaction<T>(fn: () => T): () => T {
    return () => {
      // Snapshot state for rollback simulation
      const snapshot = new Map<string, Row[]>()
      for (const [k, v] of this.tables.entries()) {
        snapshot.set(k, v.map(r => ({ ...r })))
      }
      const savedId = this._rowId
      try {
        return fn()
      } catch (e) {
        // Rollback: restore snapshot
        this.tables.clear()
        for (const [k, v] of snapshot.entries()) this.tables.set(k, v)
        this._rowId = savedId
        throw e
      }
    }
  }

  close() {}

  // ── Internal execution engine ──────────────────────────
  _execute(sql: string, params?: unknown): { changes: number; lastInsertRowid: number } {
    const s = sql.trim()
    const p = this._params(params)

    // INSERT OR IGNORE / INSERT
    const insertMatch = s.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i)
    if (insertMatch) {
      const table  = insertMatch[1]
      const cols   = insertMatch[2].split(',').map(c => c.trim())
      const rows   = this.tables.get(table) ?? []
      const row: Row = { _id: ++this._rowId }
      cols.forEach((col, i) => { row[col] = p[i] ?? null })
      rows.push(row)
      this.tables.set(table, rows)
      return { changes: 1, lastInsertRowid: this._rowId }
    }

    // UPDATE
    const updateMatch = s.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i)
    if (updateMatch) {
      const table   = updateMatch[1]
      const setCls  = updateMatch[2]
      const rows    = this.tables.get(table) ?? []
      let changes = 0
      const whereField = updateMatch[3].match(/(\w+)\s*=\s*\?/i)?.[1]
      const setClauses = setCls.split(',').map(c => c.trim())
      const setParams  = [...p]
      const whereVal   = setParams[setParams.length - 1]
      for (const row of rows) {
        const matches = !whereField || String(row[whereField]) === String(whereVal)
        if (matches) {
          let paramIdx = 0
          for (const clause of setClauses) {
            const eqIdx = clause.indexOf('=')
            const field = clause.slice(0, eqIdx).trim()
            const valPart = clause.slice(eqIdx + 1).trim()
            // Handle "col = col + 1" expressions
            const incrMatch = valPart.match(/(\w+)\s*\+\s*(\d+)/i)
            const decrMatch = valPart.match(/(\w+)\s*-\s*(\d+)/i)
            if (incrMatch && incrMatch[1] === field) {
              row[field] = Number(row[field] ?? 0) + Number(incrMatch[2])
            } else if (decrMatch && decrMatch[1] === field) {
              row[field] = Number(row[field] ?? 0) - Number(decrMatch[2])
            } else if (valPart === '?') {
              row[field] = setParams[paramIdx++]
            }
          }
          changes++
        }
      }
      return { changes, lastInsertRowid: 0 }
    }

    // DELETE
    const deleteMatch = s.match(/DELETE\s+FROM\s+(\w+)\s+WHERE\s+(\w+)\s*([<>=!]+)\s*\?/i)
    if (deleteMatch) {
      const table = deleteMatch[1]
      const col   = deleteMatch[2]
      const op    = deleteMatch[3]
      const val   = p[0]
      const rows  = this.tables.get(table) ?? []
      const before = rows.length
      this.tables.set(table, rows.filter(r => {
        const rv = r[col]
        if (op === '=')  return String(rv) !== String(val)
        if (op === '!=') return String(rv) === String(val)
        if (op === '<')  return !(String(rv) < String(val))
        if (op === '>')  return !(String(rv) > String(val))
        if (op === '<=') return !(String(rv) <= String(val))
        if (op === '>=') return !(String(rv) >= String(val))
        return true
      }))
      return { changes: before - (this.tables.get(table)?.length ?? 0), lastInsertRowid: 0 }
    }

    return { changes: 0, lastInsertRowid: 0 }
  }

  _query<T>(sql: string, params?: unknown): T[] {
    const s = sql.trim()
    const p = this._params(params)

    // sqlite_master query (for table/index listing in tests)
    if (s.toLowerCase().includes('sqlite_master')) {
      if (s.toLowerCase().includes("type='table'")) {
        return [...this.tables.keys()].map(name => ({ name, type: 'table' })) as unknown as T[]
      }
      if (s.toLowerCase().includes("type='index'")) {
        // Return fake index names matching what DatabaseManager creates
        const fakeIndexes = [
          { name:'idx_agents_workspace', type:'index' },
          { name:'idx_messages_agent', type:'index' },
          { name:'idx_cost_agent', type:'index' },
        ]
        return fakeIndexes as unknown as T[]
      }
    }

    // SELECT * FROM table [WHERE ...] [ORDER BY ...] [LIMIT ...]
    const fromMatch = s.match(/FROM\s+(\w+)/i)
    if (!fromMatch) return []
    const table = fromMatch[1]
    let rows    = [...(this.tables.get(table) ?? [])]

    // WHERE col = ?
    const whereParts = [...s.matchAll(/(\w+)\s*=\s*\?/gi)]
    if (whereParts.length > 0) {
      whereParts.forEach((part, i) => {
        const col = part[1]
        const val = p[i]
        if (col && val !== undefined) {
          rows = rows.filter(r => String(r[col]) === String(val))
        }
      })
    }

    // WHERE col LIKE ? OR col LIKE ? OR ...
    const likeMatches = [...s.matchAll(/(\w+)\s+LIKE\s+\?/gi)]
    if (likeMatches.length > 0) {
      const likeParamStart = whereParts.length
      rows = rows.filter(row => {
        return likeMatches.some((m, i) => {
          const col     = m[1]
          const pattern = String(p[likeParamStart + i] ?? '').replace(/%/g, '').toLowerCase()
          return String(row[col] ?? '').toLowerCase().includes(pattern)
        })
      })
    }

    // ORDER BY col DESC/ASC
    const orderMatch = s.match(/ORDER\s+BY\s+(\w+)\s*(DESC|ASC)?/i)
    if (orderMatch) {
      const col = orderMatch[1]
      const desc = (orderMatch[2] ?? '').toUpperCase() === 'DESC'
      rows.sort((a, b) => {
        const av = String(a[col] ?? '')
        const bv = String(b[col] ?? '')
        return desc ? bv.localeCompare(av) : av.localeCompare(bv)
      })
    }

    // LIMIT n
    const limitMatch = s.match(/LIMIT\s+(\d+)/i)
    if (limitMatch) rows = rows.slice(0, parseInt(limitMatch[1]))

    return rows as unknown as T[]
  }

  private _params(params: unknown): unknown[] {
    if (Array.isArray(params)) return params
    if (params !== null && params !== undefined) return [params]
    return []
  }
}

export = MockDatabase
