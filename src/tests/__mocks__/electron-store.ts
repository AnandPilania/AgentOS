class ElectronStore<T extends Record<string, unknown> = Record<string, unknown>> {
  private data: Record<string, unknown>
  readonly store: T

  constructor(options?: { defaults?: T; name?: string; cwd?: string }) {
    this.data  = { ...(options?.defaults ?? {}) }
    // Proxy store to data
    this.store = new Proxy(this.data, {
      get: (t, k) => t[k as string],
      set: (t, k, v) => { t[k as string] = v; return true },
    }) as unknown as T
  }

  get<K extends keyof T>(key: K): T[K] {
    // Support dot-notation keys
    const parts = String(key).split('.')
    let cur: unknown = this.data
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') return undefined as unknown as T[K]
      cur = (cur as Record<string, unknown>)[p]
    }
    return cur as T[K]
  }

  set<K extends keyof T>(key: K, value: T[K]): void
  set(obj: Partial<T>): void
  set(keyOrObj: unknown, value?: unknown): void {
    if (typeof keyOrObj === 'string') {
      this.data[keyOrObj] = value
    } else if (keyOrObj && typeof keyOrObj === 'object') {
      Object.assign(this.data, keyOrObj)
    }
  }

  has(key: string): boolean { return key in this.data }
  delete(key: string): void { delete this.data[key] }
  clear(): void { Object.keys(this.data).forEach(k => delete this.data[k]) }
  get size() { return Object.keys(this.data).length }
}

export default ElectronStore
