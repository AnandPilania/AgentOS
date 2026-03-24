import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import path from 'path'
import { DatabaseManager } from './managers/DatabaseManager'
import { SettingsManager } from './managers/SettingsManager'
import { AuthManager } from './managers/AuthManager'
import { AuditManager } from './managers/AuditManager'
import { WorkspaceManager } from './managers/WorkspaceManager'
import { AgentManager } from './managers/AgentManager'
import { TerminalManager } from './managers/TerminalManager'
import { MCPManager } from './managers/MCPManager'
import { SessionManager } from './managers/SessionManager'
import { TemplateManager } from './managers/TemplateManager'
import { PipelineManager } from './managers/PipelineManager'
import { CollabManager } from './managers/CollabManager'
import { registerAllHandlers } from './ipc/allHandlers'
import { logger } from './utils/logger'

// ─── Singletons ───────────────────────────────────────────
let mainWindow: BrowserWindow | null = null
let db: DatabaseManager
let settings: SettingsManager
let auth: AuthManager
let audit: AuditManager
let workspaces: WorkspaceManager
let agents: AgentManager
let terminals: TerminalManager
let mcp: MCPManager
let sessions: SessionManager
let templates: TemplateManager
let pipelines: PipelineManager
let collab: CollabManager

async function initManagers(): Promise<void> {
    const userDataPath = app.getPath('userData')

    db = new DatabaseManager(path.join(userDataPath, 'agentos-v2.db'))
    settings = new SettingsManager(userDataPath)
    auth = new AuthManager(db, settings)
    audit = new AuditManager(db)
    workspaces = new WorkspaceManager(db, settings)
    mcp = new MCPManager()
    agents = new AgentManager(db, settings, workspaces, audit, mcp)
    terminals = new TerminalManager()
    sessions = new SessionManager(db)
    templates = new TemplateManager(db)
    pipelines = new PipelineManager(db, agents)
    collab = new CollabManager()

    // Auto-connect saved MCP servers that were enabled
    const savedMCP = db.all<Record<string, string>>('SELECT * FROM mcp_servers WHERE enabled = 1')
    for (const s of savedMCP) {
        try {
            await mcp.addServer({
                name: s.name,
                description: s.description ?? '',
                transport: s.transport as 'stdio' | 'sse' | 'websocket',
                command: s.command ?? undefined,
                args: JSON.parse(s.args ?? '[]'),
                url: s.url ?? undefined,
                env: JSON.parse(s.env ?? '{}'),
                enabled: true,
            })
        } catch (err) {
            logger.warn(`Failed to auto-connect MCP server "${s.name}": ${err}`)
        }
    }

    // Prune stale audit entries older than 90 days
    try { audit.purge(90) } catch {
        //
    }

    logger.info(`AgentOS v2 managers initialized — userData: ${userDataPath}`)
}

async function createWindow(): Promise<void> {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 600,
        backgroundColor: '#0a0b0d',
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        frame: process.platform !== 'darwin',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: false,
            sandbox: false,
            spellcheck: false,
        },
        show: false,
        icon: path.join(__dirname, '../../assets/icons/icon.png'),
    })

    if (process.env.NODE_ENV === 'development') {
        await mainWindow.loadURL('http://localhost:5173')
        mainWindow.webContents.openDevTools({ mode: 'detach' })
    } else {
        await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show()
        mainWindow?.focus()
    })

    mainWindow.on('closed', () => { mainWindow = null })

    // Open external links in system browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url)
        return { action: 'deny' }
    })

    // Security: block navigation to external URLs in main window
    mainWindow.webContents.on('will-navigate', (event, url) => {
        const isDev = process.env.NODE_ENV === 'development'
        const isLocal = url.startsWith('http://localhost') || url.startsWith('file://')
        if (!isDev && !isLocal) event.preventDefault()
    })

    mainWindow.webContents.on('devtools-opened', () => {
        mainWindow?.webContents.devToolsWebContents?.executeJavaScript(`
      const originalLog = console.error;
      console.error = (...args) => {
        if (args[0]?.includes?.('Autofill.enable')) return;
          originalLog(...args);
        };
      `);
    });
}

function setupAutoUpdater(): void {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => mainWindow?.webContents.send('app:update-available', info))
    autoUpdater.on('download-progress', (prog) => mainWindow?.webContents.send('app:download-progress', prog))
    autoUpdater.on('update-downloaded', (info) => mainWindow?.webContents.send('app:update-downloaded', info))

    if (process.env.NODE_ENV !== 'development') {
        autoUpdater.checkForUpdates().catch(err => logger.warn(`Auto-update check failed: ${err}`))
    }
}

// ─── App Lifecycle ────────────────────────────────────────
app.whenReady().then(async () => {
    logger.info(`AgentOS v2 starting — platform: ${process.platform}, arch: ${process.arch}`)

    await initManagers()
    await createWindow()

    registerAllHandlers(
        ipcMain, mainWindow!,
        agents, workspaces, terminals,
        auth, settings, audit,
        mcp, sessions, templates,
        db,
    )

    setupAutoUpdater()

    // Prune stale collab presence every 30s
    setInterval(() => collab.pruneStalePresence(), 30_000)

    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) await createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
    logger.info('AgentOS v2 shutting down…')
    await agents?.stopAll()
    terminals?.destroyAll()
    await mcp?.disconnectAll()
    collab?.close()
    db?.close()
    logger.info('Shutdown complete')
})
