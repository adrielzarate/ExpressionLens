import manifest from '../whisper-assets.json'

interface ModelEnvironment {
  allowLocalModels: boolean
  allowRemoteModels: boolean
  useBrowserCache: boolean
  localModelPath: string
  remoteHost: string
  fetch(input: string | URL, init?: RequestInit): Promise<Response>
}
export const WHISPER_REVISION = manifest.revision
export function localWhisperPath(base = import.meta.env.BASE_URL) {
  if (!base.startsWith('/') || base.startsWith('//'))
    throw new Error('Whisper requires a same-origin application base path.')
  return `${base.replace(/\/$/, '')}/${manifest.publicPath}/`
}
export function configureLocalWhisper(
  environment: ModelEnvironment,
  origin: string,
  base = import.meta.env.BASE_URL,
) {
  const path = localWhisperPath(base)
  const fetchLocal = environment.fetch.bind(environment)
  environment.allowLocalModels = true
  environment.allowRemoteModels = false
  environment.useBrowserCache = true
  environment.localModelPath = path
  // Also keep metadata/cache candidate URLs on this origin. There is no HF
  // fallback, even when an optional file or tokenizer metadata is missing.
  environment.remoteHost = `${origin}/`
  environment.fetch = (input, init) => {
    const url = new URL(input, origin)
    if (url.origin !== origin)
      return Promise.reject(new Error('External Whisper asset request blocked.'))
    // Fail closed on redirects; a same-origin endpoint must not redirect to HF.
    return fetchLocal(url.href, { ...init, redirect: 'error' })
  }
  return path
}
