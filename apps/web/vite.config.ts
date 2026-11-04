import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { speechRuntimeAssets } from './stt-assets.mjs'
import { vocalAssets } from './vocal-assets.mjs'
import { whisperAssets } from './whisper-assets.mjs'
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
    plugins: [
      react(),
      classifierAssets(),
      speechRuntimeAssets(),
      whisperAssets(),
      vocalAssets(),
      {
        name: 'web-inference-boundary',
        generateBundle(_options, bundle) {
          for (const output of Object.values(bundle)) {
            if (output.type !== 'chunk') continue
            for (const id of Object.keys(output.modules)) {
              if (/[\\/]apps[\\/]lab[\\/]|[\\/]references[\\/]/.test(id))
                this.error(`Lab or dataset module imported by Web: ${id}`)
            }
          }
        },
      },
    ],
    resolve: {
      conditions: [
        'onnxruntime-web-use-extern-wasm',
        'module',
        'browser',
        'development|production',
      ],
    },
    worker: { format: 'es' },
    build: {
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL('./index.html', import.meta.url)),
          vocal: fileURLToPath(new URL('./experiments/vocal/index.html', import.meta.url)),
          stt: fileURLToPath(new URL('./experiments/stt/index.html', import.meta.url)),
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5174,
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
    preview: { host: '0.0.0.0', port: 4174, strictPort: true, https },
  }
})
