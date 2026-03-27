// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getAgentos = () => (window as any).agentos

const invoke = (channel: string, ...args: unknown[]): Promise<unknown> => {
    const bridge = getAgentos()
    if (!bridge?.invoke) {
        console.warn(`[AgentOS] IPC not available — channel: ${channel}`)
        return Promise.reject(new Error('AgentOS bridge not available. Are you running inside Electron?'))
    }
    return bridge.invoke(channel, ...args)
}

const on = (channel: string, cb: (...args: unknown[]) => void): (() => void) => {
    const bridge = getAgentos()
    if (!bridge?.on) return () => { }
    return bridge.on(channel, cb)
}

export const ipc = {
    invoke,
    on,
    off: (channel: string, cb: unknown) => {
        getAgentos()?.off?.(channel, cb)
    },

    get platform(): string {
        return getAgentos()?.platform ?? process.platform ?? 'web'
    },

    agents: {
        create: (d: unknown) => invoke('agent:create', d),
        destroy: (id: string) => invoke('agent:destroy', id),
        list: () => invoke('agent:list'),
        get: (id: string) => invoke('agent:get', id),
        start: (id: string) => invoke('agent:start', id),
        stop: (id: string) => invoke('agent:stop', id),
        pause: (id: string) => invoke('agent:pause', id),
        sendMessage: (id: string, msg: string) => invoke('agent:send-message', { id, message: msg }),
        getMessages: (id: string) => invoke('agent:get-messages', id),
        clone: (id: string) => invoke('agent:clone', id),
        onStatusChange: (cb: (...a: unknown[]) => void) => on('agent:status-change', cb),
        onMessageChunk: (cb: (...a: unknown[]) => void) => on('agent:message-chunk', cb),
        onToolCall: (cb: (...a: unknown[]) => void) => on('agent:tool-call', cb),
    },

    workspaces: {
        create: (d: unknown) => invoke('workspace:create', d),
        delete: (id: string) => invoke('workspace:delete', id),
        list: () => invoke('workspace:list'),
        get: (id: string) => invoke('workspace:get', id),
        diff: (id: string) => invoke('workspace:diff', id),
        commit: (id: string, msg: string) => invoke('workspace:commit', { id, message: msg }),
        files: (id: string) => invoke('workspace:files', id),
        readFile: (id: string, p: string) => invoke('workspace:read-file', { id, path: p }),
        writeFile: (id: string, p: string, c: string) => invoke('workspace:write-file', { id, path: p, content: c }),
        cloneRepo: (d: unknown) => invoke('workspace:clone-repo', d),
        branches: (id: string) => invoke('workspace:branch-list', id),
        checkout: (id: string, b: string) => invoke('workspace:checkout', { id, branch: b }),
    },

    terminal: {
        create: (d: unknown) => invoke('terminal:create', d),
        destroy: (id: string) => invoke('terminal:destroy', id),
        input: (id: string, data: string) => invoke('terminal:input', { id, data }),
        resize: (id: string, cols: number, rows: number) => invoke('terminal:resize', { id, cols, rows }),
        list: () => invoke('terminal:list'),
        onOutput: (cb: (...a: unknown[]) => void) => on('terminal:output', cb),
    },

    auth: {
        login: (data: { email: string; password: string }) => invoke('auth:login', data),
        logout: () => invoke('auth:logout'),
        register: (data: { email: string; name: string; password: string }) => invoke('auth:register', data),
        me: (data: { token: string }) => invoke('auth:me', data),
        updatePrefs: (data: unknown) => invoke('auth:update-prefs', data),
        ssoInit: (provider: string) => invoke('auth:sso-init', provider),
    },

    settings: {
        get: () => invoke('settings:get'),
        set: (d: unknown) => invoke('settings:set', d),
        reset: () => invoke('settings:reset'),
        export: () => invoke('settings:export'),
        import: (d: unknown) => invoke('settings:import', d),
    },

    providers: {
        list: () => invoke('providers:list'),
        save: (d: unknown) => invoke('providers:save', d),
        test: (d: unknown) => invoke('providers:test', d),
        models: (p: string) => invoke('providers:models', p),
    },

    audit: {
        list: (f: unknown) => invoke('audit:list', f),
        export: (f: unknown) => invoke('audit:export', f),
    },

    sessions: {
        list: (d?: unknown) => invoke('sessions:list', d),
        create: (d: unknown) => invoke('sessions:create', d),
        get: (id: string) => invoke('sessions:get', id),
        update: (id: string, patch: unknown) => invoke('sessions:update', { id, ...(patch as object) }),
        delete: (id: string) => invoke('sessions:delete', id),
        touch: (id: string) => invoke('sessions:touch', id),
        buildPanes: (layout: string, agentIds: string[]) => invoke('sessions:build-panes', { layout, agentIds }),
    },

    pipelines: {
        list: (sessionId?: string) => invoke('pipeline:list', sessionId),
        create: (d: unknown) => invoke('pipeline:create', d),
        run: (id: string) => invoke('pipeline:run', id),
        stop: (id: string) => invoke('pipeline:stop', id),
    },

    app: {
        version: () => invoke('app:version'),
        openExternal: (url: string) => invoke('app:open-external', url),
        notify: (d: unknown) => invoke('app:notify', d),
        showDialog: (opts: unknown) => invoke('app:show-dialog', opts),
        checkUpdate: () => invoke('app:check-update'),
        installUpdate: () => invoke('app:install-update'),
        onUpdateAvailable: (cb: (...a: unknown[]) => void) => on('app:update-available', cb),
        onDownloadProgress: (cb: (...a: unknown[]) => void) => on('app:download-progress', cb),
        onUpdateDownloaded: (cb: (...a: unknown[]) => void) => on('app:update-downloaded', cb),
    },

    teams: {
        list: (d?: { sessionId?: string }) => invoke('team:list', d),
        get: (id: string) => invoke('team:get', id),
        update: (id: string, patch: unknown) => invoke('team:update', { id, patch }),
        delete: (id: string) => invoke('team:delete', id),
        createAgents: (d: unknown) => invoke('team:create-agents', d),
        send: (teamId: string, message: string, contextFiles?: string[]) =>
            invoke('team:send', { teamId, message, contextFiles }),
        stopRun: (runId: string) => invoke('team:stop-run', runId),
        listRuns: (teamId: string) => invoke('team:list-runs', teamId),
        getRun: (runId: string) => invoke('team:get-run', runId),
        getConversation: (teamId: string) => invoke('team:get-conversation', teamId),
        clearHistory: (teamId: string) => invoke('team:clear-history', teamId),
    },
    context: {
        index: (workspaceId: string, force?: boolean) =>
            invoke('context:index', { workspaceId, force }),
        search: (workspaceId: string, query: string, topK?: number) =>
            invoke('context:search', { workspaceId, query, topK }),
        stats: (workspaceId: string) => invoke('context:stats', workspaceId),
        clear: (workspaceId: string) => invoke('context:clear', workspaceId),
    },
    ws: {
        tree: (workspaceId: string, maxDepth?: number) =>
            invoke('ws:tree', { workspaceId, maxDepth }),
        readFile: (workspaceId: string, relPath: string) =>
            invoke('ws:read-file', { workspaceId, relPath }),
        searchFiles: (workspaceId: string, pattern: string) =>
            invoke('ws:search-files', { workspaceId, pattern }),
    },
}

export function isElectron(): boolean {
    return typeof getAgentos() !== 'undefined'
}
