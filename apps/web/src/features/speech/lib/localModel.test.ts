import { expect, it, vi } from 'vitest'
import { configureLocalWhisper, localWhisperPath, WHISPER_REVISION } from './localModel'
import manifest from '../whisper-assets.json'
function environment() {
  return {
    allowLocalModels: false,
    allowRemoteModels: true,
    useBrowserCache: false,
    localModelPath: '/old/',
    remoteHost: 'https://huggingface.co/',
    fetch: vi.fn(async (_input: string | URL, _init?: RequestInit) => new Response('local model')),
  }
}
it('configures a pinned local directory, disables remote fallback and keeps browser caching without fetching eagerly', () => {
  const env = environment(),
    originalFetch = env.fetch
  const path = configureLocalWhisper(env, 'https://interview.test', '/')
  expect(path).toBe(`/models/whisper-tiny-q8/${WHISPER_REVISION}/`)
  expect(env.allowLocalModels).toBe(true)
  expect(env.allowRemoteModels).toBe(false)
  expect(env.useBrowserCache).toBe(true)
  expect(env.remoteHost).toBe('https://interview.test/')
  expect(originalFetch).not.toHaveBeenCalled()
})
it('fetches only same-origin model files and refuses redirect fallback', async () => {
  const env = environment(),
    originalFetch = env.fetch
  const path = configureLocalWhisper(env, 'https://interview.test', '/')
  await env.fetch(`${path}config.json`, { redirect: 'follow' })
  expect(originalFetch).toHaveBeenCalledWith(`https://interview.test${path}config.json`, {
    redirect: 'error',
  })
  await expect(env.fetch('https://huggingface.co/model/config.json')).rejects.toThrow('blocked')
  await expect(env.fetch('//cdn.example.com/weights.onnx')).rejects.toThrow('blocked')
  expect(originalFetch).toHaveBeenCalledTimes(1)
})
it('supports same-origin deployment subpaths, keeping cache URLs revision-specific', () => {
  expect(localWhisperPath('/interview/')).toBe(`/interview/${manifest.publicPath}/`)
  expect(() => localWhisperPath('https://external.test/')).toThrow('same-origin')
  expect(() => localWhisperPath('//external.test/')).toThrow('same-origin')
  expect(manifest.revision).toMatch(/^[a-f0-9]{40}$/)
  expect(manifest.files).toHaveLength(7)
  for (const file of manifest.files) expect(file.sha256).toMatch(/^[a-f0-9]{64}$/)
})
