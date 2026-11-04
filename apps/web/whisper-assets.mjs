import { createReadStream } from 'node:fs'
import { resolve } from 'node:path'
import { manifest, verifyWhisperAssets } from '../../scripts/whisper-assets.mjs'

// Vite copies public/ unchanged into dist/. Only the pinned, verified files get
// immutable caching; missing model files return 404 rather than the SPA HTML.
export function whisperAssets() {
  let base = '/'
  const serve = (root) => (request, response, next) => {
    const prefix = `${base}${manifest.publicPath}/`
    const pathname = request.url?.split('?')[0]
    if (!pathname?.startsWith(prefix)) return next()
    const name = pathname.slice(prefix.length)
    const file = manifest.files.find((file) => file.path === name)
    if (!file || !['GET', 'HEAD'].includes(request.method ?? 'GET')) {
      response.statusCode = 404
      response.end('Whisper asset not found')
      return
    }
    if (process.env.WHISPER_ASSET_AUDIT === '1')
      console.info(`[whisper-assets] ${request.method} ${pathname}`)
    response.setHeader(
      'Content-Type',
      name.endsWith('.json') ? 'application/json' : 'application/octet-stream',
    )
    response.setHeader('Content-Length', file.bytes)
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    if (request.method === 'HEAD') return response.end()
    const stream = createReadStream(resolve(root, manifest.publicPath, name))
    stream.on('error', () => {
      if (!response.headersSent) response.statusCode = 404
      response.end()
    })
    stream.pipe(response)
  }
  return {
    name: 'self-hosted-whisper-assets',
    async configResolved(config) {
      base = config.base.endsWith('/') ? config.base : `${config.base}/`
      await verifyWhisperAssets()
    },
    configureServer(server) {
      server.middlewares.use(serve(server.config.publicDir))
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve(resolve(server.config.root, server.config.build.outDir)))
    },
  }
}
