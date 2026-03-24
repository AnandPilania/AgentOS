export function spawn(_shell: string, _args: string[], _opts?: unknown) {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {}
  return {
    pid:    12345,
    process:'bash',
    write:  jest.fn(),
    resize: jest.fn(),
    kill:   jest.fn(),
    on(event: string, cb: (...args: unknown[]) => void) {
      listeners[event] = listeners[event] ?? []
      listeners[event].push(cb)
    },
    onData: jest.fn(),
    onExit: jest.fn(),
    stdin:  { write: jest.fn() },
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
  }
}
