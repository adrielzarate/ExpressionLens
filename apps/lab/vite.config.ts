import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { classifierAssets } from '@expressionlens/classifier/vite'

export default defineConfig(({ command }) => {
  const cert = new URL('../../.certs/dev-cert.pem', import.meta.url)
  const key = new URL('../../.certs/dev-key.pem', import.meta.url)
  if (command === 'serve' && (!existsSync(cert) || !existsSync(key))) {
    throw new Error('HTTPS certificates are missing. Run: npm run https:setup -- <your-LAN-IP>')
  }
  const https =
    command === 'serve' ? { cert: readFileSync(cert), key: readFileSync(key) } : undefined
  return {
    plugins: [react(), classifierAssets()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      https,
      fs: {
        deny: [
          '.env',
          '.env.*',
          '*.{crt,pem}',
          '**/.git/**',
          `${fileURLToPath(new URL('../../.certs', import.meta.url))}/**`,
        ],
      },
    },
    preview: { host: '0.0.0.0', port: 4173, strictPort: true, https },
  }
})
