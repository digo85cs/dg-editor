import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

const sharedAlias = {
  '@': resolve('src'),
  '@main': resolve('src/main'),
  '@shared': resolve('src/shared')
}

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    build: {
      target: 'node20',
      rollupOptions: {
        input: resolve('src/main/index.ts'),
        external: ['electron', 'bcryptjs', 'node-pty']
      }
    },
    plugins: []
  },
  preload: {
    resolve: { alias: sharedAlias },
    build: {
      target: 'node20',
      rollupOptions: {
        input: resolve('src/preload/index.ts'),
        external: ['electron']
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: []
  }
})