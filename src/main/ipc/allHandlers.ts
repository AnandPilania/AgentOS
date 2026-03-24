import type { IpcMain, BrowserWindow } from 'electron'
import type { AgentManager }     from '../managers/AgentManager'
import type { WorkspaceManager } from '../managers/WorkspaceManager'
import type { TerminalManager }  from '../managers/TerminalManager'
import type { AuthManager }      from '../managers/AuthManager'
import type { SettingsManager }  from '../managers/SettingsManager'
import type { AuditManager }     from '../managers/AuditManager'
import type { MCPManager }       from '../managers/MCPManager'
import type { SessionManager }   from '../managers/SessionManager'
import type { TemplateManager }  from '../managers/TemplateManager'

export function registerAllHandlers(
  ipc:        IpcMain,
  win:        BrowserWindow,
  agents:     AgentManager,
  workspaces: WorkspaceManager,
  terminals:  TerminalManager,
  auth:       AuthManager,
  settings:   SettingsManager,
  audit:      AuditManager,
  mcp:        MCPManager,
  sessions:   SessionManager,
  templates:  TemplateManager,
  db:         import('../managers/DatabaseManager').DatabaseManager,
): void {

  agents.setWindow(win)
  terminals.setWindow(win)

  // ─── Agent ─────────────────────────────────────────────
  ipc.handle('agent:create',       (_, d)  => agents.create(d))
  ipc.handle('agent:destroy',      (_, id) => agents.destroy(id))
  ipc.handle('agent:list',         ()      => agents.list())
  ipc.handle('agent:get',          (_, id) => agents.get(id))
  ipc.handle('agent:start',        (_, id) => agents.start(id))
  ipc.handle('agent:stop',         (_, id) => agents.stop(id))
  ipc.handle('agent:pause',        (_, id) => agents.pause(id))
  ipc.handle('agent:send-message', (_, d: Record<string,string>)  => agents.sendMessage(d.id, d.message))
  ipc.handle('agent:get-messages', (_, id) => agents.getMessages(id))
  ipc.handle('agent:clone',        (_, id) => agents.clone(id))

  // ─── Workspace ─────────────────────────────────────────
  ipc.handle('workspace:create',      (_, d)  => workspaces.create(d))
  ipc.handle('workspace:delete',      (_, id) => workspaces.delete(id))
  ipc.handle('workspace:list',        ()      => workspaces.list())
  ipc.handle('workspace:get',         (_, id) => workspaces.get(id))
  ipc.handle('workspace:diff',        (_, id) => workspaces.getDiff(id))
  ipc.handle('workspace:commit',      (_, d)  => workspaces.commit(d.id, d.message))
  ipc.handle('workspace:files',       (_, id) => workspaces.getFileTree(id))
  ipc.handle('workspace:read-file',   (_, d)  => workspaces.readFile(d.id, d.path))
  ipc.handle('workspace:write-file',  (_, d)  => workspaces.writeFile(d.id, d.path, d.content))
  ipc.handle('workspace:clone-repo',  (_, d)  => workspaces.cloneRepo(d.url, d.path, d.name))
  ipc.handle('workspace:branch-list', (_, id) => workspaces.getBranches(id))
  ipc.handle('workspace:checkout',    (_, d)  => workspaces.checkout(d.id, d.branch))

  // ─── Terminal ──────────────────────────────────────────
  ipc.handle('terminal:create',  (_, d)  => terminals.create(d))
  ipc.handle('terminal:destroy', (_, id) => terminals.destroy(id))
  ipc.handle('terminal:input',   (_, d)  => { terminals.write(d.id, d.data); return true })
  ipc.handle('terminal:resize',  (_, d)  => { terminals.resize(d.id, d.cols, d.rows); return true })
  ipc.handle('terminal:list',    ()      => terminals.list())

  // ─── Auth ──────────────────────────────────────────────
  ipc.handle('auth:register', async (_, d: Record<string,string>) => {
    const r = await auth.register(d.email, d.name, d.password)
    audit.log({ userId:r.user.id, action:'register', resource:'user', resourceId:r.user.id, metadata:{}, severity:'low' })
    return r
  })
  ipc.handle('auth:login', async (_, d: Record<string,string>) => {
    const r = await auth.login(d.email, d.password)
    audit.log({ userId:r.user.id, action:'login', resource:'user', resourceId:r.user.id, metadata:{provider:'local'}, severity:'low' })
    return r
  })
  ipc.handle('auth:me', async (_, d: Record<string,string>) => {
    if (!d?.token) throw new Error('No token')
    const { userId } = auth.verifyToken(d.token)
    return auth.getUserById(userId)
  })
  ipc.handle('auth:logout',      () => true)
  ipc.handle('auth:sso-init',    (_, provider) => {
    // SSO: open external OAuth URL — provider-specific logic goes here
    const { shell } = require('electron')
    if (provider === 'github') shell.openExternal('https://github.com/login/oauth/authorize')
    return { initiated: true, provider }
  })
  ipc.handle('auth:update-prefs',(_, d: Record<string,unknown>) => auth.updatePreferences(d.userId as string, d.preferences as import('../../shared/types').UserPreferences))

  // ─── Settings ──────────────────────────────────────────
  ipc.handle('settings:get',    ()      => settings.get())
  ipc.handle('settings:set',    (_, d)  => { settings.set(d); return true })
  ipc.handle('settings:reset',  ()      => { settings.reset(); return true })
  ipc.handle('settings:export', ()      => JSON.stringify(settings.get()))
  ipc.handle('settings:import', (_, d)  => { settings.set(JSON.parse(d)); return true })
  ipc.handle('providers:list',  ()      => settings.get().providers)
  ipc.handle('providers:save',  (_, d)  => { settings.saveProviderConfig(d); return true })
  ipc.handle('providers:test',  ()      => ({ success: true }))
  ipc.handle('providers:models',()      => [])

  // ─── Audit ─────────────────────────────────────────────
  ipc.handle('audit:list',   (_, f) => audit.list(f))
  ipc.handle('audit:export', (_, f) => JSON.stringify(audit.list(f)))

  // ─── MCP ───────────────────────────────────────────────
  ipc.handle('mcp:list',       ()      => mcp.getServers())
  ipc.handle('mcp:add', async (_, d: Record<string,unknown>) => {
    const server = await mcp.addServer(d as Parameters<typeof mcp.addServer>[0])
    // Persist to DB so it survives restarts
    const existing = db.get('SELECT id FROM mcp_servers WHERE id = ?', [server.id])
    if (!existing) {
      db.run(
        `INSERT INTO mcp_servers (id,name,description,transport,command,args,url,env,enabled,status,tools,resources,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [server.id, server.name, server.description ?? '', server.transport,
         server.command ?? null, JSON.stringify(server.args ?? []),
         server.url ?? null, JSON.stringify(server.env ?? {}),
         server.enabled ? 1 : 0, server.status,
         JSON.stringify(server.tools), JSON.stringify(server.resources),
         server.createdAt]
      )
    }
    return server
  })
  ipc.handle('mcp:remove',     (_, id) => mcp.removeServer(id))
  ipc.handle('mcp:connect',    (_, id) => mcp.connect(id).then(() => mcp.getServer(id)))
  ipc.handle('mcp:disconnect', (_, id) => mcp.disconnect(id))
  ipc.handle('mcp:call-tool',  (_, d)  => mcp.callTool(d.serverId, d.toolName, d.input))

  // Forward MCP events to renderer
  mcp.on('server:update', (server) => { if (!win.isDestroyed()) win.webContents.send('mcp:server-update', server) })
  mcp.on('server:connect',(id, tools)=>{ if (!win.isDestroyed()) win.webContents.send('mcp:server-connect', {id, tools}) })
  mcp.on('server:error',  (id, err) =>{ if (!win.isDestroyed()) win.webContents.send('mcp:server-error', {id, err}) })

  // ─── Sessions ──────────────────────────────────────────
  ipc.handle('sessions:list',         (_, d: Record<string,string>)  => sessions.list(d?.userId ?? 'system'))
  ipc.handle('sessions:create',       (_, d)  => sessions.create(d))
  ipc.handle('sessions:get',          (_, id) => sessions.get(id))
  ipc.handle('sessions:update',       (_, d)  => { sessions.update(d.id, d); return true })
  ipc.handle('sessions:delete',       (_, id) => { sessions.delete(id); return true })
  ipc.handle('sessions:touch',        (_, id) => { sessions.touch(id); return true })
  ipc.handle('sessions:build-panes',  (_, d)  => sessions.buildPaneConfig(d.layout, d.agentIds))

  // ─── Templates ─────────────────────────────────────────
  ipc.handle('templates:list',    (_, d)   => templates.list(d?.category))
  ipc.handle('templates:get',     (_, id)  => templates.get(id))
  ipc.handle('templates:search',  (_, d)   => templates.search(d.query))
  ipc.handle('templates:install', (_, id)  => { templates.install(id); return true })

  // ─── Cost ──────────────────────────────────────────────
  ipc.handle('cost:summary', (_, d) => agents.getCostSummary(d))

  // ─── Search ────────────────────────────────────────────
  ipc.handle('search:query', (_, d) => {
    const query   = String(d.query)
    const results = []

    // Search messages
    const msgs = agents.searchMessages(query)
    results.push(...msgs.slice(0,10).map(m => ({
      type:'message', id:m.message.id,
      title:`Message from agent`,
      excerpt:m.message.content.slice(0,120),
      score:0.9, agentId:m.agentId, timestamp:m.message.timestamp,
    })))

    // Search agents
    const agentList = agents.list()
    agentList.filter(a => a.name.toLowerCase().includes(query.toLowerCase())).forEach(a => {
      results.push({ type:'agent', id:a.id, title:a.name, excerpt:`${a.provider} · ${a.model}`, score:1 })
    })

    // Search templates
    const tpl = templates.search(query)
    tpl.slice(0,5).forEach(t => {
      results.push({ type:'template', id:t.id, title:t.name, excerpt:t.description, score:0.7 })
    })

    return results
  })

  // ─── App ───────────────────────────────────────────────
  const { app, shell, dialog, Notification } = require('electron')
  ipc.handle('app:version',       () => app.getVersion())
  ipc.handle('app:check-update',  () => ({ checking: true }))
  ipc.handle('app:install-update',() => true)
  ipc.handle('app:open-external', (_, url) => shell.openExternal(url))
  ipc.handle('app:show-dialog',   (_, o)   => dialog.showOpenDialog(win, o))
  ipc.handle('app:notify',        (_, d)   => { if (Notification.isSupported()) new Notification({title:d.title, body:d.body}).show(); return true })
}
