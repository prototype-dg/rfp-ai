import build from '@hono/vite-build/cloudflare-workers'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    build({
      entry: 'src/index.tsx',
    }),
  ],
})
