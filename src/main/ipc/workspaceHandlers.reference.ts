import type { IpcMain, BrowserWindow } from 'electron'
import type { WorkspaceManager } from '../managers/WorkspaceManager'
import type { TerminalManager }  from '../managers/TerminalManager'
import type { AuthManager }      from '../managers/AuthManager'
import type { SettingsManager }  from '../managers/SettingsManager'
import type { AuditManager }     from '../managers/AuditManager'
import type { MCPManager }       from '../managers/MCPManager'
import type { SessionManager }   from '../managers/SessionManager'
import type { TemplateManager }  from '../managers/TemplateManager'
import type { AgentManager }     from '../managers/AgentManager'

export function registerWorkspaceHandlers(ipc: IpcMain, wm: WorkspaceManager) {
  ipc.handle('workspace:create',      (_, d)    => wm.create(d))
  ipc.handle('workspace:delete',      (_, id)   => wm.delete(id))
  ipc.handle('workspace:list',        ()        => wm.list())
  ipc.handle('workspace:get',         (_, id)   => wm.get(id))
  ipc.handle('workspace:diff',        (_, id)   => wm.getDiff(id))
  ipc.handle('workspace:commit',      (_, d)    => wm.commit(d.id, d.message))
  ipc.handle('workspace:files',       (_, id)   => wm.getFileTree(id))
  ipc.handle('workspace:read-file',   (_, d)    => wm.readFile(d.id, d.path))
  ipc.handle('workspace:write-file',  (_, d)    => wm.writeFile(d.id, d.path, d.content))
  ipc.handle('workspace:clone-repo',  (_, d)    => wm.cloneRepo(d.url, d.path, d.name))
  ipc.handle('workspace:branch-list', (_, id)   => wm.getBranches(id))
  ipc.handle('workspace:checkout',    (_, d)    => wm.checkout(d.id, d.branch))
}

export function registerTerminalHandlers(ipc: IpcMain, tm: TerminalManager, win: BrowserWindow | null) {
  tm.setWindow(win!)
  ipc.handle('terminal:create',  (_, d)  => tm.create(d))
  ipc.handle('terminal:destroy', (_, id) => tm.destroy(id))
  ipc.handle('terminal:input',   (_, d)  => { tm.write(d.id, d.data); return true })
  ipc.handle('terminal:resize',  (_, d)  => { tm.resize(d.id, d.cols, d.rows); return true })
  ipc.handle('terminal:list',    ()      => tm.list())
}

export function registerAuthHandlers(ipc: IpcMain, auth: AuthManager, audit: AuditManager) {
  ipc.handle('auth:register', async (_, d) => { const r = await auth.register(d.email,d.name,d.password); audit.log({userId:r.user.id,action:'register',resource:'user',resourceId:r.user.id,metadata:{},severity:'low'}); return r })
  ipc.handle('auth:login',    async (_, d) => { const r = await auth.login(d.email,d.password); audit.log({userId:r.user.id,action:'login',resource:'user',resourceId:r.user.id,metadata:{provider:'local'},severity:'low'}); return r })
  ipc.handle('auth:me',       async (_, d) => { if(!d?.token) throw new Error('No token'); const {userId}=auth.verifyToken(d.token); return auth.getUserById(userId) })
  ipc.handle('auth:logout',   () => true)
  ipc.handle('auth:update-prefs', async (_, d) => { await auth.updatePreferences(d.userId, d.preferences); return true })
}

export function registerSettingsHandlers(ipc: IpcMain, settings: SettingsManager) {
  ipc.handle('settings:get',   ()     => settings.get())
  ipc.handle('settings:set',   (_, d) => { settings.set(d); return true })
  ipc.handle('settings:reset', ()     => { settings.reset(); return true })
  ipc.handle('providers:list', ()     => settings.get().providers)
  ipc.handle('providers:save', (_, d) => { settings.saveProviderConfig(d); return true })
  ipc.handle('providers:test', ()     => ({ success: true }))
}

export function registerAuditHandlers(ipc: IpcMain, audit: AuditManager) {
  ipc.handle('audit:list',   (_, f) => audit.list(f))
  ipc.handle('audit:export', (_, f) => JSON.stringify(audit.list(f)))
}

export function registerMCPHandlers(ipc: IpcMain, mcp: MCPManager, win: BrowserWindow | null) {
  mcp.on('server:update', (s) => win?.webContents.send('mcp:server-update', s))
  ipc.handle('mcp:list',       ()        => mcp.getServers())
  ipc.handle('mcp:add',        (_, d)    => mcp.addServer(d))
  ipc.handle('mcp:remove',     (_, id)   => mcp.removeServer(id))
  ipc.handle('mcp:connect',    (_, id)   => mcp.connect(id).then(() => mcp.getServer(id)))
  ipc.handle('mcp:disconnect', (_, id)   => mcp.disconnect(id))
  ipc.handle('mcp:call-tool',  (_, d)    => mcp.callTool(d.serverId, d.toolName, d.input))
}

export function registerSessionHandlers(ipc: IpcMain, sessions: SessionManager) {
  ipc.handle('sessions:list',   (_, d)  => sessions.list(d?.userId ?? 'system'))
  ipc.handle('sessions:create', (_, d)  => sessions.create(d))
  ipc.handle('sessions:get',    (_, id) => sessions.get(id))
  ipc.handle('sessions:update', (_, d)  => { sessions.update(d.id, d.patch); return true })
  ipc.handle('sessions:delete', (_, id) => { sessions.delete(id); return true })
}

export function registerTemplateHandlers(ipc: IpcMain, templates: TemplateManager) {
  ipc.handle('templates:list',    (_, d) => templates.list(d?.category))
  ipc.handle('templates:get',     (_, id)=> templates.get(id))
  ipc.handle('templates:search',  (_, d) => templates.search(d.query))
  ipc.handle('templates:install', (_, id)=> { templates.install(id); return true })
}

export function registerCostHandlers(ipc: IpcMain, agents: AgentManager) {
  ipc.handle('cost:summary', (_, f) => agents.getCostSummary(f))
}

export function registerSearchHandlers(ipc: IpcMain, agents: AgentManager) {
  ipc.handle('search:query', (_, d) => {
    const q = d.query as string
    const msgs = agents.searchMessages(q).map(({agentId,message}) => ({
      type:'message', id:message.id, title:`Message from agent`, excerpt:message.content.slice(0,120), score:1, agentId, timestamp:message.timestamp,
    }))
    return msgs
  })
}

import { app } from 'electron'
export function registerAppHandlers(ipc: IpcMain, win: BrowserWindow|null, shell: Electron.Shell, dialog: Electron.Dialog, Notification: typeof Electron.Notification) {
  ipc.handle('app:version',       () => app.getVersion())
  ipc.handle('app:open-external', (_, url) => shell.openExternal(url))
  ipc.handle('app:show-dialog',   (_, opts) => dialog.showOpenDialog(win!, opts))
  ipc.handle('app:notify',        (_, d) => { if(Notification.isSupported()) new Notification({title:d.title,body:d.body}).show(); return true })
}
