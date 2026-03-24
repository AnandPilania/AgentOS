/**
 * AgentOS v2 — Unit Tests
 * Run with: npm test
 *
 * Uses real SQLite in temp directories.
 * Electron, electron-store, node-pty are auto-mocked via __mocks__.
 */

import path from 'path'
import fs   from 'fs/promises'
import os   from 'os'

// ─── ToolEngine ──────────────────────────────────────────
describe('ToolEngine', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let engine: any
  let tmpDir: string

  beforeEach(async () => {
    const { ToolEngine } = await import('../main/managers/ToolEngine')
    engine = new ToolEngine()
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentos-tool-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  })

  const ctx = () => ({ workspacePath: tmpDir, agentId: 'test-agent' })

  test('read_file: reads file content correctly', async () => {
    await fs.writeFile(path.join(tmpDir, 'hello.txt'), 'Hello, AgentOS!')
    const result = await engine.execute('read_file', { path: 'hello.txt' }, ctx())
    expect(result.isError).toBe(false)
    expect(result.output).toContain('Hello, AgentOS!')
    expect(typeof result.duration).toBe('number')
  })

  test('read_file: blocks path traversal attack', async () => {
    const result = await engine.execute('read_file', { path: '../../../etc/passwd' }, ctx())
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(/traversal|blocked/i)
  })

  test('write_file: creates file and nested directories', async () => {
    const result = await engine.execute('write_file', {
      path:    'nested/deep/file.ts',
      content: 'export const x = 42',
    }, ctx())
    expect(result.isError).toBe(false)
    const written = await fs.readFile(path.join(tmpDir, 'nested/deep/file.ts'), 'utf-8')
    expect(written).toBe('export const x = 42')
  })

  test('write_file: blocks path traversal', async () => {
    const result = await engine.execute('write_file', {
      path:    '../../evil.sh',
      content: 'rm -rf /',
    }, ctx())
    expect(result.isError).toBe(true)
  })

  test('list_files: filters by glob pattern', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.ts'),  '')
    await fs.writeFile(path.join(tmpDir, 'b.ts'),  '')
    await fs.writeFile(path.join(tmpDir, 'c.js'),  '')
    await fs.writeFile(path.join(tmpDir, 'd.json'),'')
    const result = await engine.execute('list_files', { pattern: '**/*.ts' }, ctx())
    expect(result.isError).toBe(false)
    expect(result.output).toContain('a.ts')
    expect(result.output).toContain('b.ts')
    expect(result.output).not.toContain('c.js')
  })

  test('list_files: returns "No files found" when nothing matches', async () => {
    const result = await engine.execute('list_files', { pattern: '**/*.xyz' }, ctx())
    expect(result.isError).toBe(false)
    expect(result.output).toContain('No files found')
  })

  test('search_code: finds pattern across multiple files', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.ts'), 'function doWork() { return 42 }')
    await fs.writeFile(path.join(tmpDir, 'b.ts'), 'const value = doWork()')
    await fs.writeFile(path.join(tmpDir, 'c.ts'), 'export default class Foo {}')
    const result = await engine.execute('search_code', { pattern: 'doWork' }, ctx())
    expect(result.isError).toBe(false)
    expect(result.output).toContain('a.ts')
    expect(result.output).toContain('b.ts')
    expect(result.output).not.toContain('c.ts')
  })

  test('search_code: returns "No matches found" when pattern absent', async () => {
    await fs.writeFile(path.join(tmpDir, 'x.ts'), 'const x = 1')
    const result = await engine.execute('search_code', { pattern: 'ZZZNOTPRESENT' }, ctx())
    expect(result.isError).toBe(false)
    expect(result.output).toContain('No matches')
  })

  test('grep: finds lines matching pattern in a file', async () => {
    await fs.writeFile(path.join(tmpDir, 'code.ts'), [
      'const alpha = 1',
      'const beta  = 2',
      'const alpha2 = 3',
      'const gamma = 4',
    ].join('\n'))
    const result = await engine.execute('grep', { pattern: 'alpha', path: 'code.ts' }, ctx())
    expect(result.isError).toBe(false)
    expect(result.output).toContain('alpha')
    expect(result.output).toContain('alpha2')
    expect(result.output).not.toContain('gamma')
  })

  test('bash: executes commands and captures stdout', async () => {
    const result = await engine.execute('bash', { command: 'echo "hello from bash"' }, ctx())
    expect(result.isError).toBe(false)
    expect(result.output).toContain('hello from bash')
  })

  test('bash: captures non-zero exit code', async () => {
    const result = await engine.execute('bash', { command: 'exit 1' }, ctx())
    // Should not throw, just report exit code
    expect(result.output).toContain('Exit code: 1')
  })

  test('bash: blocks dangerous rm -rf / command', async () => {
    const result = await engine.execute('bash', { command: 'rm -rf /' }, ctx())
    expect(result.isError).toBe(true)
    expect(result.output).toMatch(/blocked|dangerous/i)
  })

  test('bash: runs in workspace directory', async () => {
    const result = await engine.execute('bash', { command: 'pwd' }, ctx())
    expect(result.isError).toBe(false)
    expect(result.output.trim()).toBe(tmpDir)
  })

  test('git_status: works in non-git directory without crashing', async () => {
    const result = await engine.execute('git_status', {}, ctx())
    // Either shows status or error - both are fine
    expect(typeof result.output).toBe('string')
  })

  test('records duration for all tools', async () => {
    await fs.writeFile(path.join(tmpDir, 'f.txt'), 'test')
    const result = await engine.execute('read_file', { path: 'f.txt' }, ctx())
    expect(result.duration).toBeGreaterThanOrEqual(0)
  })

  test('unknown tool returns error gracefully', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await engine.execute('unknown_tool' as any, {}, ctx())
    expect(typeof result.output).toBe('string')
  })
})

// ─── SessionManager ──────────────────────────────────────
describe('SessionManager', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sessions: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db:       any
  let dbPath:   string

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `agentos-sess-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    const { DatabaseManager } = await import('../main/managers/DatabaseManager')
    const { SessionManager  } = await import('../main/managers/SessionManager')
    db       = new DatabaseManager(dbPath)
    sessions = new SessionManager(db)
  })

  afterEach(async () => {
    db?.close()
    await fs.unlink(dbPath).catch(() => {})
  })

  test('create: stores session with defaults', () => {
    const s = sessions.create({ name: 'My Session', workspaceId: 'ws-1', userId: 'user-1' })
    expect(s.id).toBeDefined()
    expect(s.name).toBe('My Session')
    expect(s.workspaceId).toBe('ws-1')
    expect(s.userId).toBe('user-1')
    expect(s.paneLayout).toBe('single')
    expect(Array.isArray(s.paneConfig.panes)).toBe(true)
    expect(s.paneConfig.panes).toHaveLength(1)
  })

  test('get: retrieves exact session by id', () => {
    const created = sessions.create({ name: 'TestGet', workspaceId: 'ws-1', userId: 'u1' })
    const found   = sessions.get(created.id)
    expect(found).toBeDefined()
    expect(found!.id).toBe(created.id)
    expect(found!.name).toBe('TestGet')
  })

  test('get: returns undefined for nonexistent id', () => {
    expect(sessions.get('nonexistent-id-xyz')).toBeUndefined()
  })

  test('list: returns only sessions for correct user', () => {
    sessions.create({ name: 'A', workspaceId: 'ws-1', userId: 'u1' })
    sessions.create({ name: 'B', workspaceId: 'ws-2', userId: 'u1' })
    sessions.create({ name: 'C', workspaceId: 'ws-3', userId: 'u2' })
    const u1 = sessions.list('u1')
    const u2 = sessions.list('u2')
    expect(u1).toHaveLength(2)
    expect(u2).toHaveLength(1)
    expect(u1.map((s: { name: string }) => s.name).sort()).toEqual(['A', 'B'])
  })

  test('update: patches name field', () => {
    const s = sessions.create({ name: 'Old Name', workspaceId: 'ws-1', userId: 'u1' })
    sessions.update(s.id, { name: 'New Name' })
    const updated = sessions.get(s.id)
    expect(updated!.name).toBe('New Name')
  })

  test('update: patches paneLayout field', () => {
    const s = sessions.create({ name: 'Test', workspaceId: 'ws-1', userId: 'u1' })
    sessions.update(s.id, { paneLayout: 'split-h' })
    const updated = sessions.get(s.id)
    expect(updated!.paneLayout).toBe('split-h')
  })

  test('delete: removes session permanently', () => {
    const s = sessions.create({ name: 'ToDelete', workspaceId: 'ws-1', userId: 'u1' })
    sessions.delete(s.id)
    expect(sessions.get(s.id)).toBeUndefined()
  })

  test('touch: updates lastActiveAt', async () => {
    const s      = sessions.create({ name: 'Touch', workspaceId: 'ws-1', userId: 'u1' })
    const before = s.lastActiveAt
    await new Promise(r => setTimeout(r, 5))
    sessions.touch(s.id)
    const after  = sessions.get(s.id)!.lastActiveAt
    expect(after >= before).toBe(true)
  })

  test('buildPaneConfig single: creates one pane', () => {
    const cfg = sessions.buildPaneConfig('single', ['agent-1'])
    expect(cfg.panes).toHaveLength(1)
    expect(cfg.panes[0].agentId).toBe('agent-1')
    expect(cfg.panes[0].size).toBe(100)
    expect(cfg.panes[0].panel).toBe('chat')
  })

  test('buildPaneConfig split-h: creates two panes 50/50', () => {
    const cfg = sessions.buildPaneConfig('split-h', ['a1', 'a2'])
    expect(cfg.panes).toHaveLength(2)
    expect(cfg.panes[0].size).toBe(50)
    expect(cfg.panes[1].size).toBe(50)
    expect(cfg.panes[0].agentId).toBe('a1')
    expect(cfg.panes[1].agentId).toBe('a2')
  })

  test('buildPaneConfig quad: creates four panes', () => {
    const cfg = sessions.buildPaneConfig('quad', ['a1','a2','a3','a4'])
    expect(cfg.panes).toHaveLength(4)
    cfg.panes.forEach((p: { id: string }) => expect(p.id).toBeDefined())
  })

  test('addAgentToSession: appends agent id', () => {
    const s = sessions.create({ name: 'Add', workspaceId: 'ws-1', userId: 'u1' })
    sessions.addAgentToSession(s.id, 'agent-x')
    const updated = sessions.get(s.id)!
    expect(updated.agentIds).toContain('agent-x')
  })

  test('addAgentToSession: does not duplicate agent ids', () => {
    const s = sessions.create({ name: 'NoDup', workspaceId: 'ws-1', userId: 'u1' })
    sessions.addAgentToSession(s.id, 'agent-y')
    sessions.addAgentToSession(s.id, 'agent-y')
    const updated = sessions.get(s.id)!
    expect(updated.agentIds.filter((id: string) => id === 'agent-y')).toHaveLength(1)
  })
})

// ─── TemplateManager ─────────────────────────────────────
describe('TemplateManager', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let templates: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db:        any
  let dbPath:    string

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `agentos-tpl-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    const { DatabaseManager }  = await import('../main/managers/DatabaseManager')
    const { TemplateManager }  = await import('../main/managers/TemplateManager')
    db        = new DatabaseManager(dbPath)
    templates = new TemplateManager(db)
  })

  afterEach(async () => {
    db?.close()
    await fs.unlink(dbPath).catch(() => {})
  })

  test('seeds built-in templates on first init', () => {
    const all = templates.list()
    expect(all.length).toBeGreaterThan(0)
    expect(all.some((t: { builtin: boolean }) => t.builtin)).toBe(true)
  })

  test('does not duplicate built-in templates on re-init', async () => {
    const { TemplateManager }  = await import('../main/managers/TemplateManager')
    const templates2 = new TemplateManager(db)
    const count1 = templates.list().length
    const count2 = templates2.list().length
    expect(count1).toBe(count2)
  })

  test('list: returns all templates without filter', () => {
    const all = templates.list()
    expect(Array.isArray(all)).toBe(true)
    expect(all.length).toBeGreaterThan(5)
  })

  test('list: filters by category correctly', () => {
    const coding  = templates.list('coding')
    const testing = templates.list('testing')
    const devops  = templates.list('devops')
    expect(coding.every((t: { category: string }) => t.category === 'coding')).toBe(true)
    expect(testing.every((t: { category: string }) => t.category === 'testing')).toBe(true)
    expect(devops.every((t: { category: string }) => t.category === 'devops')).toBe(true)
  })

  test('get: retrieves template by id', () => {
    const all  = templates.list()
    const first = all[0]
    const found = templates.get(first.id)
    expect(found).toBeDefined()
    expect(found!.id).toBe(first.id)
    expect(found!.name).toBe(first.name)
  })

  test('get: returns undefined for unknown id', () => {
    expect(templates.get('nonexistent-template-id')).toBeUndefined()
  })

  test('search: matches by name', () => {
    const results = templates.search('engineer')
    expect(results.length).toBeGreaterThan(0)
    results.forEach((t: { name: string; description: string; tags: string[] }) => {
      const haystack = [t.name, t.description, ...t.tags].join(' ').toLowerCase()
      expect(haystack).toContain('engineer')
    })
  })

  test('search: matches by tag', () => {
    const results = templates.search('docker')
    expect(results.length).toBeGreaterThan(0)
  })

  test('search: returns empty array for no matches', () => {
    const results = templates.search('ZZZNOMATCHXXX')
    expect(results).toHaveLength(0)
  })

  test('install: increments download count', () => {
    const all   = templates.list()
    const tpl   = all[0]
    const before = tpl.downloads
    templates.install(tpl.id)
    const after  = templates.get(tpl.id)!
    expect(after.downloads).toBe(before + 1)
  })

  test('all built-in templates have required non-empty fields', () => {
    templates.list()
      .filter((t: { builtin: boolean }) => t.builtin)
      .forEach((t: {
        name: string; prompt: string; provider: string
        model: string; tools: unknown[]; tags: unknown[]
        description: string; author: string
      }) => {
        expect(t.name.length).toBeGreaterThan(0)
        expect(t.prompt.length).toBeGreaterThan(10)
        expect(t.provider).toBeTruthy()
        expect(t.model).toBeTruthy()
        expect(Array.isArray(t.tools)).toBe(true)
        expect(t.tools.length).toBeGreaterThan(0)
        expect(t.description.length).toBeGreaterThan(0)
        expect(t.author).toBeTruthy()
      })
  })

  test('built-in templates only use valid providers', () => {
    const validProviders = ['anthropic', 'openai', 'gemini', 'ollama', 'custom']
    templates.list()
      .filter((t: { builtin: boolean }) => t.builtin)
      .forEach((t: { provider: string }) => {
        expect(validProviders).toContain(t.provider)
      })
  })
})

// ─── AuditManager ────────────────────────────────────────
describe('AuditManager', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let audit:  any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db:     any
  let dbPath: string

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `agentos-audit-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
    const { DatabaseManager } = await import('../main/managers/DatabaseManager')
    const { AuditManager }    = await import('../main/managers/AuditManager')
    db    = new DatabaseManager(dbPath)
    audit = new AuditManager(db)
  })

  afterEach(async () => {
    db?.close()
    await fs.unlink(dbPath).catch(() => {})
  })

  test('log: stores an audit event', () => {
    audit.log({
      userId: 'user-1', action: 'login', resource: 'user',
      resourceId: 'user-1', metadata: { ip: '127.0.0.1' }, severity: 'low',
    })
    const events = audit.list()
    expect(events).toHaveLength(1)
    expect(events[0].action).toBe('login')
    expect(events[0].userId).toBe('user-1')
    expect(events[0].severity).toBe('low')
  })

  test('log: generates unique ids and timestamps', () => {
    audit.log({ userId:'u1', action:'a1', resource:'r', resourceId:'id1', metadata:{}, severity:'low' })
    audit.log({ userId:'u1', action:'a2', resource:'r', resourceId:'id2', metadata:{}, severity:'low' })
    const events = audit.list()
    expect(events[0].id).not.toBe(events[1].id)
    expect(events[0].timestamp).toBeDefined()
  })

  test('list: filters by userId', () => {
    audit.log({ userId:'u1', action:'a', resource:'r', resourceId:'1', metadata:{}, severity:'low' })
    audit.log({ userId:'u2', action:'b', resource:'r', resourceId:'2', metadata:{}, severity:'low' })
    const u1Events = audit.list({ userId: 'u1' })
    expect(u1Events).toHaveLength(1)
    expect(u1Events[0].userId).toBe('u1')
  })

  test('list: filters by action substring', () => {
    audit.log({ userId:'u1', action:'user.login', resource:'user', resourceId:'1', metadata:{}, severity:'low' })
    audit.log({ userId:'u1', action:'agent.create', resource:'agent', resourceId:'2', metadata:{}, severity:'low' })
    const loginEvents = audit.list({ action: 'login' })
    expect(loginEvents).toHaveLength(1)
    expect(loginEvents[0].action).toBe('user.login')
  })

  test('list: orders by timestamp descending', () => {
    for (let i = 0; i < 3; i++) {
      audit.log({ userId:'u1', action:`action-${i}`, resource:'r', resourceId:`${i}`, metadata:{}, severity:'low' })
    }
    const events = audit.list()
    for (let i = 0; i < events.length - 1; i++) {
      expect(events[i].timestamp >= events[i+1].timestamp).toBe(true)
    }
  })

  test('list: respects limit', () => {
    for (let i = 0; i < 10; i++) {
      audit.log({ userId:'u1', action:`a${i}`, resource:'r', resourceId:`${i}`, metadata:{}, severity:'low' })
    }
    const limited = audit.list({ limit: 3 })
    expect(limited).toHaveLength(3)
  })

  test('export: returns valid JSON string', () => {
    audit.log({ userId:'u1', action:'test', resource:'r', resourceId:'1', metadata:{}, severity:'low' })
    const json = audit.export()
    expect(() => JSON.parse(json)).not.toThrow()
    const parsed = JSON.parse(json)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0].action).toBe('test')
  })

  test('purge: removes entries older than cutoff', async () => {
    // Log an old event by directly inserting with old timestamp
    const oldTimestamp = new Date(Date.now() - 91 * 86400000).toISOString()
    db.run(
      `INSERT INTO audit_logs (id,user_id,action,resource,resource_id,metadata,severity,timestamp)
       VALUES (?,?,?,?,?,?,?,?)`,
      ['old-id','u1','old-action','r','1','{}','low', oldTimestamp]
    )
    audit.log({ userId:'u1', action:'new-action', resource:'r', resourceId:'2', metadata:{}, severity:'low' })

    const before = audit.list()
    expect(before.length).toBe(2)

    const removed = audit.purge(90)
    expect(removed).toBe(1)

    const after = audit.list()
    expect(after).toHaveLength(1)
    expect(after[0].action).toBe('new-action')
  })
})

// ─── DatabaseManager ─────────────────────────────────────
describe('DatabaseManager', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db:     any
  let dbPath: string

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `agentos-db-${Date.now()}.db`)
    const { DatabaseManager } = await import('../main/managers/DatabaseManager')
    db = new DatabaseManager(dbPath)
  })

  afterEach(async () => {
    db?.close()
    await fs.unlink(dbPath).catch(() => {})
  })

  test('creates all required tables', () => {
    const tables = db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).map((r: { name: string }) => r.name)

    const required = [
      'agents', 'agent_messages', 'agent_templates', 'audit_logs',
      'cost_entries', 'mcp_servers', 'pipelines', 'provider_configs',
      'sessions', 'users', 'workspaces',
    ]
    required.forEach(t => {
      expect(tables).toContain(t)
    })
  })

  test('run/get/all work correctly', () => {
    const now = new Date().toISOString()
    db.run(
      `INSERT INTO users (id,email,name,role,auth_provider,preferences,created_at,last_login_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      ['user-1','test@test.com','Test User','member','local','{}',now,now]
    )
    const user = db.get<{ email: string }>("SELECT * FROM users WHERE id = 'user-1'")
    expect(user?.email).toBe('test@test.com')

    const all = db.all<{ id: string }>('SELECT * FROM users')
    expect(all).toHaveLength(1)
  })

  test('transaction: rolls back on error', () => {
    expect(() => {
      db.transaction(() => {
        const now = new Date().toISOString()
        db.run(
          `INSERT INTO users (id,email,name,role,auth_provider,preferences,created_at,last_login_at)
           VALUES (?,?,?,?,?,?,?,?)`,
          ['tx-user','tx@test.com','TX','member','local','{}',now,now]
        )
        throw new Error('Intentional rollback')
      })
    }).toThrow('Intentional rollback')

    const user = db.get("SELECT * FROM users WHERE id = 'tx-user'")
    expect(user).toBeUndefined()
  })

  test('get: returns undefined for missing row', () => {
    const result = db.get("SELECT * FROM users WHERE id = 'does-not-exist'")
    expect(result).toBeUndefined()
  })

  test('creates performance indexes', () => {
    const indexes = db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
    ).map((r: { name: string }) => r.name)
    expect(indexes.length).toBeGreaterThan(0)
    expect(indexes.some((n: string) => n.includes('agent'))).toBe(true)
  })
})

// ─── IPC Channels ────────────────────────────────────────
describe('IPC Channel Constants', () => {
  test('all values are non-empty strings', async () => {
    const { IPC } = await import('../shared/ipc-channels')
    const values: unknown[] = []
    const collect = (obj: Record<string, unknown>) => {
      for (const v of Object.values(obj)) {
        if (typeof v === 'string') values.push(v)
        else if (v && typeof v === 'object') collect(v as Record<string, unknown>)
      }
    }
    collect(IPC as unknown as Record<string, unknown>)
    expect(values.length).toBeGreaterThan(40)
    values.forEach(v => {
      expect(typeof v).toBe('string')
      expect((v as string).length).toBeGreaterThan(0)
      expect(v).toMatch(/^[a-z][a-z0-9:_-]+$/)
    })
  })

  test('no duplicate channel names', async () => {
    const { IPC } = await import('../shared/ipc-channels')
    const values: string[] = []
    const collect = (obj: Record<string, unknown>) => {
      for (const v of Object.values(obj)) {
        if (typeof v === 'string') values.push(v)
        else if (v && typeof v === 'object') collect(v as Record<string, unknown>)
      }
    }
    collect(IPC as unknown as Record<string, unknown>)
    const unique = new Set(values)
    expect(unique.size).toBe(values.length)
  })
})

// ─── Shared Types ─────────────────────────────────────────
describe('Shared Types module', () => {
  test('loads without errors', async () => {
    const types = await import('../shared/types')
    expect(types).toBeDefined()
  })
})
