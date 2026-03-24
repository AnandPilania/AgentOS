import type { IpcMain, BrowserWindow } from 'electron'
import type { AgentManager } from '../managers/AgentManager'

export function registerAgentHandlers(ipc: IpcMain, agents: AgentManager, win: BrowserWindow | null) {
    agents.setWindow(win!)

    ipc.handle('agent:create', (_, d) => agents.create(d))
    ipc.handle('agent:destroy', (_, id) => agents.destroy(id))
    ipc.handle('agent:list', () => agents.list())
    ipc.handle('agent:get', (_, id) => agents.get(id))
    ipc.handle('agent:start', (_, id) => agents.start(id))
    ipc.handle('agent:stop', (_, id) => agents.stop(id))
    ipc.handle('agent:pause', (_, id) => agents.pause(id))
    ipc.handle('agent:send-message', (_, d) => agents.sendMessage(d.id, d.message))
    ipc.handle('agent:get-messages', (_, id) => agents.getMessages(id))
    ipc.handle('agent:clone', (_, id) => agents.clone(id))
}
