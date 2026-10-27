import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
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