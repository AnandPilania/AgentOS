import Store from 'electron-store'
import crypto from 'crypto'
import type { AppSettings, ProviderConfig, AIProvider } from '../../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
    providers: [],
    workspace: {
        defaultPath: '',
        gitAutoCommit: false,
        dockerEnabled: false,
        maxAgents: 10,
        queueSize: 20,
    },
    auth: {
        provider: 'local',
        jwtSecret: crypto.randomBytes(32).toString('hex'),
        sessionTTL: 60 * 60 * 24 * 30,
    },
    appearance: {
        theme: 'dark',
        accentColor: '#6355fa',
        fontSize: 14,
        fontFamily: 'JetBrains Mono',
        density: 'normal',
        animations: true,
        defaultLayout: 'single',
    },
    mcp: {
        servers: [],
        autoConnect: true,
        timeoutMs: 30_000,
    },
    collab: {
        enabled: false,
        serverUrl: 'ws://localhost:3001',
    },
    telemetry: false,
    updateChannel: 'stable',
}

export class SettingsManager {
    private store: Store<AppSettings>

    constructor(userDataPath: string) {
        this.store = new Store<AppSettings>({
            name: 'settings-v2',
            cwd: userDataPath,
            defaults: DEFAULT_SETTINGS,
        })
    }

    get(): AppSettings {
        // Merge with defaults to ensure new fields are present
        return { ...DEFAULT_SETTINGS, ...this.store.store }
    }

    set(data: Partial<AppSettings>): void {
        for (const [k, v] of Object.entries(data)) {
            this.store.set(k as keyof AppSettings, v as AppSettings[keyof AppSettings])
        }
    }

    reset(): void { this.store.clear() }

    getJwtSecret(): string {
        return (this.store.get('auth') as AppSettings['auth']).jwtSecret
    }

    getProviderConfig(provider: AIProvider): ProviderConfig | undefined {
        const providers = (this.store.get('providers') ?? []) as ProviderConfig[]
        return providers.find(p => p.provider === provider)
    }

    saveProviderConfig(config: ProviderConfig): void {
        const providers = ((this.store.get('providers') ?? []) as ProviderConfig[])
        const idx = providers.findIndex(p => p.provider === config.provider)
        if (idx >= 0) providers[idx] = config
        else providers.push(config)
        this.store.set('providers', providers)
    }

    getAll(): AppSettings {
        return this.get()
    }
}
