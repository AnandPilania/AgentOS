import { v4 as uuid }  from 'uuid'
import bcrypt          from 'bcryptjs'
import jwt             from 'jsonwebtoken'
import type { User, UserPreferences, AuthProvider } from '../../shared/types'
import { DatabaseManager } from './DatabaseManager'
import { SettingsManager } from './SettingsManager'
import { logger } from '../utils/logger'

interface LoginResult { user: User; token: string }

export class AuthManager {
  constructor(
    private db:       DatabaseManager,
    private settings: SettingsManager,
  ) {}

  async register(email: string, name: string, password: string): Promise<LoginResult> {
    const existing = this.db.get('SELECT id FROM users WHERE email = ?', [email])
    if (existing) throw new Error('Email already in use')

    const hash = await bcrypt.hash(password, 12)
    const now  = new Date().toISOString()
    const user: User = {
      id:           uuid(),
      email,
      name,
      role:         'member',
      authProvider: 'local',
      createdAt:    now,
      lastLoginAt:  now,
      preferences:  this.defaultPrefs(),
    }

    this.db.run(
      `INSERT INTO users (id,email,name,password,role,auth_provider,preferences,created_at,last_login_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [user.id, user.email, user.name, hash, user.role, user.authProvider,
       JSON.stringify(user.preferences), user.createdAt, user.lastLoginAt]
    )

    logger.info(`User registered: ${user.email}`)
    return { user, token: this.signToken(user.id) }
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const row = this.db.get<Record<string, string>>('SELECT * FROM users WHERE email = ?', [email])
    if (!row) throw new Error('Invalid credentials')

    const valid = await bcrypt.compare(password, row.password ?? '')
    if (!valid) throw new Error('Invalid credentials')

    const user = this.rowToUser(row)
    this.db.run('UPDATE users SET last_login_at = ? WHERE id = ?', [new Date().toISOString(), user.id])
    logger.info(`User logged in: ${user.email}`)
    return { user, token: this.signToken(user.id) }
  }

  verifyToken(token: string): { userId: string } {
    const secret = this.settings.getJwtSecret()
    return jwt.verify(token, secret) as { userId: string }
  }

  getUserById(id: string): User | undefined {
    const row = this.db.get<Record<string, string>>('SELECT * FROM users WHERE id = ?', [id])
    return row ? this.rowToUser(row) : undefined
  }

  async updatePreferences(userId: string, prefs: Partial<UserPreferences>): Promise<void> {
    const user = this.getUserById(userId)
    if (!user) throw new Error('User not found')
    const merged = { ...user.preferences, ...prefs }
    this.db.run('UPDATE users SET preferences = ? WHERE id = ?',
      [JSON.stringify(merged), userId])
  }

  // ─── SSO ──────────────────────────────────────────────
  async loginOrCreateSSO(profile: {
    email: string; name: string; provider: AuthProvider; providerId: string
  }): Promise<LoginResult> {
    let row = this.db.get<Record<string, string>>('SELECT * FROM users WHERE email = ?', [profile.email])

    if (!row) {
      const now = new Date().toISOString()
      const user: User = {
        id: uuid(), email: profile.email, name: profile.name,
        role: 'member', authProvider: profile.provider,
        createdAt: now, lastLoginAt: now,
        preferences: this.defaultPrefs(),
      }
      this.db.run(
        `INSERT INTO users (id,email,name,role,auth_provider,preferences,created_at,last_login_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        [user.id, user.email, user.name, user.role, user.authProvider,
         JSON.stringify(user.preferences), user.createdAt, user.lastLoginAt]
      )
      return { user, token: this.signToken(user.id) }
    }

    const user = this.rowToUser(row)
    this.db.run('UPDATE users SET last_login_at = ? WHERE id = ?', [new Date().toISOString(), user.id])
    return { user, token: this.signToken(user.id) }
  }

  // ─── Helpers ──────────────────────────────────────────
  private signToken(userId: string): string {
    const secret = this.settings.getJwtSecret()
    return jwt.sign({ userId }, secret, { expiresIn: '30d' })
  }

  private defaultPrefs(): UserPreferences {
    return {
      theme:          'dark',
      fontSize:        14,
      fontFamily:     'JetBrains Mono',
      terminalTheme:  'void',
      defaultProvider:'anthropic',
      defaultModel:   'claude-sonnet-4-5',
      autoSave:        true,
      telemetry:       false,
      keymap:         'default',
      defaultLayout:  'single',
      shortcuts:       {},
    }
  }

  private rowToUser(r: Record<string, string>): User {
    return {
      id: r.id, email: r.email, name: r.name, avatar: r.avatar ?? undefined,
      role: r.role as User['role'], teamId: r.team_id ?? undefined,
      authProvider: r.auth_provider as AuthProvider,
      preferences: JSON.parse(r.preferences ?? '{}'),
      createdAt: r.created_at, lastLoginAt: r.last_login_at,
    }
  }
}
