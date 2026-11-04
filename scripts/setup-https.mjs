import { mkdir, chmod, copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const directory = new URL('../.certs/', import.meta.url)
await mkdir(directory, { recursive: true, mode: 0o700 })
const hosts = [...new Set(['localhost', '127.0.0.1', '::1', ...process.argv.slice(2)])]
const key = fileURLToPath(new URL('dev-key.pem', directory))
const cert = fileURLToPath(new URL('dev-cert.pem', directory))
const result = spawnSync('mkcert', ['-key-file', key, '-cert-file', cert, ...hosts], {
  stdio: 'inherit',
})
if (result.error)
  throw new Error('Install mkcert first (macOS: brew install mkcert).', { cause: result.error })
if (result.status !== 0) process.exit(result.status ?? 1)
await chmod(key, 0o600)
const caRoot = spawnSync('mkcert', ['-CAROOT'], { encoding: 'utf8' })
if (caRoot.status !== 0) throw new Error('Cannot locate the public root certificate.')
// Export only the public certificate, never the CA private key.
await copyFile(join(caRoot.stdout.trim(), 'rootCA.pem'), new URL('rootCA.crt', directory))
console.log(
  'HTTPS certificates ready. Trust the mkcert root CA on each test device before opening the app.',
)
