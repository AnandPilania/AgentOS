import Database from 'better-sqlite3'
import { logger } from '../utils/logger'

export class DatabaseManager {
    private db: Database.Database
    private readonly MAX_PARAMS = 30000;

    constructor(dbPath: string) {
        this.db = new Database(dbPath)
        this.db.pragma('journal_mode = WAL')
        this.db.pragma('foreign_keys = ON')
        this.db.pragma('synchronous = NORMAL')
        this.db.pragma('cache_size = -64000')
        this.migrate()
        logger.info(`Database opened: ${dbPath}`)
    }

    private migrate(): void {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT, avatar TEXT, role TEXT NOT NULL DEFAULT 'member', team_id TEXT, auth_provider TEXT NOT NULL DEFAULT 'local', preferences TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, last_login_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'git-worktree', repo_url TEXT, branch TEXT, base_branch TEXT, watch_enabled INTEGER NOT NULL DEFAULT 1, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idle', provider TEXT NOT NULL, model TEXT NOT NULL, workspace_id TEXT NOT NULL, session_id TEXT NOT NULL, template_id TEXT, prompt TEXT, tags TEXT NOT NULL DEFAULT '[]', metadata TEXT NOT NULL DEFAULT '{}', mcp_servers TEXT NOT NULL DEFAULT '[]', tools TEXT NOT NULL DEFAULT '[]', max_tokens INTEGER NOT NULL DEFAULT 8096, temperature REAL NOT NULL DEFAULT 0, stats TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS agent_messages (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, tokens INTEGER, tool_calls TEXT DEFAULT '[]', cost REAL, model TEXT, timestamp TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, name TEXT NOT NULL, workspace_id TEXT NOT NULL, agent_ids TEXT NOT NULL DEFAULT '[]', user_id TEXT NOT NULL, pane_layout TEXT NOT NULL DEFAULT 'single', pane_config TEXT NOT NULL DEFAULT '{"panes":[]}', metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_active_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pipelines (id TEXT PRIMARY KEY, name TEXT NOT NULL, session_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idle', nodes TEXT NOT NULL DEFAULT '[]', edges TEXT NOT NULL DEFAULT '[]', runs TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mcp_servers (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, transport TEXT NOT NULL, command TEXT, args TEXT, url TEXT, env TEXT, enabled INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'disconnected', tools TEXT NOT NULL DEFAULT '[]', resources TEXT NOT NULL DEFAULT '[]', error TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS agent_templates (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, category TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, prompt TEXT, tools TEXT NOT NULL DEFAULT '[]', mcp_servers TEXT NOT NULL DEFAULT '[]', tags TEXT NOT NULL DEFAULT '[]', author TEXT, downloads INTEGER NOT NULL DEFAULT 0, rating REAL NOT NULL DEFAULT 5.0, verified INTEGER NOT NULL DEFAULT 0, builtin INTEGER NOT NULL DEFAULT 0, preview TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cost_entries (id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, session_id TEXT NOT NULL, user_id TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, tokens_in INTEGER NOT NULL, tokens_out INTEGER NOT NULL, cost REAL NOT NULL, timestamp TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, team_id TEXT, action TEXT NOT NULL, resource TEXT NOT NULL, resource_id TEXT NOT NULL, metadata TEXT NOT NULL DEFAULT '{}', ip TEXT, user_agent TEXT, severity TEXT NOT NULL DEFAULT 'low', timestamp TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS provider_configs (id TEXT PRIMARY KEY, provider TEXT UNIQUE NOT NULL, api_key TEXT, base_url TEXT, models TEXT NOT NULL DEFAULT '[]', enabled INTEGER NOT NULL DEFAULT 1);
      CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_messages_agent ON agent_messages(agent_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON agent_messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_cost_agent ON cost_entries(agent_id);
      CREATE INDEX IF NOT EXISTS idx_cost_timestamp ON cost_entries(timestamp);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
    `)
    }

    prepare(sql: string): Database.Statement { return this.db.prepare(sql) }
    run(sql: string, params?: any): Database.RunResult {
        const stmt = this.db.prepare(sql);
        if (params === undefined) return stmt.run();
        return (Array.isArray(params) ? stmt.run(...params) : stmt.run(params));
    }

    get<T>(sql: string, params?: any): T | undefined {
        const stmt = this.db.prepare(sql);
        if (params === undefined) return stmt.get() as T;
        return (Array.isArray(params) ? stmt.get(...params) : stmt.get(params)) as T;
    }

    all<T>(sql: string, params?: any): T[] {
        if (Array.isArray(params) && params.length > this.MAX_PARAMS) {
            throw new RangeError(`Too many parameter values: ${params.length}.`);
        }
        const stmt = this.db.prepare(sql);
        if (params === undefined) return stmt.all() as T[];
        return (Array.isArray(params) ? stmt.all(...params) : stmt.all(params)) as T[];
    }
    transaction<T>(fn: () => T): T { return this.db.transaction(fn)() }
    close(): void { this.db.close() }
}
