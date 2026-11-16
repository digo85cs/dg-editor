import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.{ts,js}'],
    globals: false,
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'out/**',
        'dist/**',
        'tmp/**',
        '.dg-editor/**',
        'qa-artifacts/**',
        'src/**/__tests__/**',
        'src/__tests__/**',
        'scripts/**',
        'test/**',
        'vitest.config.ts',
        'electron-vite.config.ts',
        '**/*.d.ts',
        '**/*.config.ts',
        '**/*.config.js',
        'src/main/mcp/**',
        'src/renderer/**',
        'src/preload/**',
        'apps/**',
      ],
      thresholds: {
        statements: 15,
        branches: 20,
        functions: 20,
        lines: 15,
      },
    },
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      electron: resolve(__dirname, 'src/__tests__/mocks/electron.ts'),
    },
  },
})