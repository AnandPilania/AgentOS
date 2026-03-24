/** @type {import('jest').Config} */
module.exports = {
  preset:          'ts-jest',
  testEnvironment: 'node',
  roots:           ['<rootDir>/src/tests'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        target:           'ES2020',
        module:           'commonjs',
        moduleResolution: 'node',
        esModuleInterop:  true,
        skipLibCheck:     true,
        strict:           false,
        baseUrl:          '<rootDir>/src',
      },
    }],
  },
  moduleNameMapper: {
    '^@shared/(.*)$':         '<rootDir>/src/shared/$1',
    '^@main/(.*)$':           '<rootDir>/src/main/$1',
    '^electron$':             '<rootDir>/src/tests/__mocks__/electron.ts',
    '^electron-store$':       '<rootDir>/src/tests/__mocks__/electron-store.ts',
    '^electron-updater$':     '<rootDir>/src/tests/__mocks__/electron-updater.ts',
    '^node-pty$':             '<rootDir>/src/tests/__mocks__/node-pty.ts',
    '^better-sqlite3$':       '<rootDir>/src/tests/__mocks__/better-sqlite3.ts',
  },
  // Transform ESM-only node_modules that might still be present
  transformIgnorePatterns: [
    'node_modules/(?!(eventemitter3)/)',
  ],
  collectCoverageFrom: [
    'src/main/managers/**/*.ts',
    'src/shared/**/*.ts',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: { branches: 40, functions: 45, lines: 45, statements: 45 },
  },
  testTimeout: 20000,
  clearMocks:  true,
  restoreMocks:true,
}
