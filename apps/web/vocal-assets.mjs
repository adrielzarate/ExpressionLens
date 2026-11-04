import { createReadStream } from 'node:fs'
import { resolve } from 'node:path'
import { vocalManifests, verifyVocalAssets } from '../../scripts/vocal-assets.mjs'
export function vocalAssets() {
  let base = '/'
  const middleware = (root) => (req, res, next) => {
    const pathname = req.url?.split('?')[0]
    const manifest = vocalManifests.find((m) => pathname?.startsWith(`${base}${m.publicPath}/`))
    if (!manifest) return next()
    const prefix = `${base}${manifest.publicPath}/`
    const file = manifest.files.find((file) => file.path === pathname.slice(prefix.length))
    if (!file || !['GET', 'HEAD'].includes(req.method)) {
      res.statusCode = 404
      res.end('SER asset not found')
      return
    }
    res.setHeader(
      'Content-Type',
      file.path.endsWith('.json')
        ? 'application/json'
        : file.path.endsWith('.md')
          ? 'text/plain'
          : 'application/octet-stream',
    )
    res.setHeader('Content-Length', file.bytes)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    const stream = createReadStream(resolve(root, manifest.publicPath, file.path))
    stream.on('error', () => {
      if (!res.headersSent) res.statusCode = 404
      res.end()
    })
    stream.pipe(res)
  }
  return {
    name: 'experimental-vocal-assets',
    async configResolved(config) {
      base = config.base
      for (const manifest of vocalManifests)
        await verifyVocalAssets(
          new URL(`./public/${manifest.publicPath}/`, import.meta.url),
          manifest,
        )
    },
    configureServer(server) {
      server.middlewares.use(middleware(server.config.publicDir))
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware(resolve(server.config.root, server.config.build.outDir)))
    },
  }
}
