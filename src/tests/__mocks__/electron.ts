export const app = {
  getPath: (name: string) => {
    const os = require('os')
    const path = require('path')
    return path.join(os.tmpdir(), 'agentos-test', name)
  },
  getVersion: () => '2.0.0-test',
  quit: jest.fn(),
  on: jest.fn(),
}

export const BrowserWindow = jest.fn().mockImplementation(() => ({
  loadURL:        jest.fn().mockResolvedValue(undefined),
  loadFile:       jest.fn().mockResolvedValue(undefined),
  show:           jest.fn(),
  focus:          jest.fn(),
  isDestroyed:    jest.fn().mockReturnValue(false),
  on:             jest.fn(),
  once:           jest.fn(),
  webContents: {
    send:                jest.fn(),
    setWindowOpenHandler: jest.fn(),
    openDevTools:        jest.fn(),
    on:                  jest.fn(),
  },
}))

export const ipcMain = {
  handle:        jest.fn(),
  on:            jest.fn(),
  removeHandler: jest.fn(),
}

export const ipcRenderer = {
  invoke:         jest.fn().mockResolvedValue(null),
  on:             jest.fn(),
  once:           jest.fn(),
  removeListener: jest.fn(),
  send:           jest.fn(),
}

export const contextBridge = {
  exposeInMainWorld: jest.fn(),
}

export const shell = {
  openExternal: jest.fn().mockResolvedValue(undefined),
}

export const dialog = {
  showOpenDialog: jest.fn().mockResolvedValue({ filePaths: [], canceled: true }),
}

export const Notification = Object.assign(
  jest.fn().mockImplementation(() => ({ show: jest.fn() })),
  { isSupported: jest.fn().mockReturnValue(true) }
)

export default {
  app, BrowserWindow, ipcMain, ipcRenderer,
  contextBridge, shell, dialog, Notification,
}
