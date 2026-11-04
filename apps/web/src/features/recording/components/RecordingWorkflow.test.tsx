import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../../../App'
import { FakeRecorder, installMedia } from '../lib/testMedia'
import { transcribeVideo } from '../../speech/lib/transcribeVideo'
import { emptyTranscription } from '../../speech/types'
import { analyzeVocal } from '../../vocal/lib/analyzeVocal'
import { vocalFixture } from '../../vocal/test/fixtures'
import { analyzeVideo } from '../../analysis/lib/analyzeVideo'
import { sessionFixture } from '../../sessions/test/fixtures'
import { parseSessionJSON, serializeSession } from '../../sessions/lib/serialization'

vi.mock('../../vocal/lib/analyzeVocal', () => ({ analyzeVocal: vi.fn() }))
vi.mock('../../speech/lib/transcribeVideo', () => ({ transcribeVideo: vi.fn() }))
vi.mock('../../analysis/lib/analyzeVideo', () => ({ analyzeVideo: vi.fn() }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('records with audio without inference, then explicitly analyzes the same File and transcribes the same completed File and exports both with source live in schema v3', async () => {
  const media = installMedia()
  let index = 0
  media.create.mockImplementation(() => `blob:recording-${++index}`)
  const fixture = sessionFixture()
  vi.mocked(analyzeVideo).mockResolvedValueOnce(fixture)
  render(<App />)
  expect(media.getUserMedia).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Record Video' }))
  expect(media.getUserMedia).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Enable camera & microphone' }))
  await screen.findByText('Camera and microphone ready.')
  const camera = screen.getByLabelText('Live camera preview') as HTMLVideoElement
  expect(camera.muted).toBe(true)
  expect(camera.playsInline).toBe(true)
  expect(camera.srcObject).toBe(media.stream)
  fireEvent.click(screen.getByRole('button', { name: 'Start Recording' }))
  expect(FakeRecorder.instances[0].stream.getAudioTracks()).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Stop Recording' }))
  expect(screen.queryByLabelText('Recorded video preview')).toBeNull()
  await act(async () => {
    FakeRecorder.instances[0].finish()
  })
  expect(screen.getByLabelText('Recorded video preview')).toBeDefined()
  expect(media.video.stop).toHaveBeenCalledOnce()
  expect(media.audio.stop).toHaveBeenCalledOnce()
  expect(analyzeVideo).not.toHaveBeenCalled()
  expect(transcribeVideo).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Analyze Recording' }))
  const preview = screen.getByLabelText('Selected video preview') as HTMLVideoElement
  Object.defineProperties(preview, {
    duration: { value: 1 },
    videoWidth: { value: 640 },
    videoHeight: { value: 480 },
  })
  fireEvent.loadedMetadata(preview)
  await screen.findByRole('heading', { name: 'Your analysis summary' })
  expect(analyzeVideo).toHaveBeenCalledOnce()
  vi.mocked(transcribeVideo).mockResolvedValueOnce({
    ...emptyTranscription('spanish'),
    status: 'completed',
    text: 'Grabación',
    segments: [{ startMs: 0, endMs: 500, text: 'Grabación' }],
  })
  fireEvent.change(screen.getByLabelText('Analysis to run'), { target: { value: 'speech' } })
  fireEvent.change(screen.getByLabelText('Transcription language'), {
    target: { value: 'spanish' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Analyze again' }))
  fireEvent.click(screen.getByRole('button', { name: 'Run selected analysis' }))
  await screen.findByText('Grabación', { selector: '.transcript-text' })
  expect(transcribeVideo).toHaveBeenCalledOnce()
  expect(vi.mocked(transcribeVideo).mock.calls[0][0]).toBeInstanceOf(File)
  expect(vi.mocked(transcribeVideo).mock.calls[0][0].name).toMatch(/\.mp4$/)
  expect(analyzeVideo).toHaveBeenCalledOnce()
  const segment = screen.getByRole('button', { name: /00:00.000.*Grabación/ })
  preview.currentTime = 0.2
  fireEvent.timeUpdate(preview)
  expect(segment.classList.contains('transcript-active')).toBe(true)
  fireEvent.pause(preview)
  expect(segment.getAttribute('aria-current')).toBe('true')
  preview.currentTime = 0.5
  fireEvent.seeked(preview)
  expect(segment.classList.contains('transcript-active')).toBe(false)
  expect(screen.getByRole('heading', { name: 'Expression timeline' })).toBeDefined()
  expect(screen.getByRole('button', { name: 'Download Video' })).toBeDefined()
  const serialization = await import('../../sessions/lib/serialization')
  const download = vi.spyOn(serialization, 'downloadSession').mockImplementation(() => {})
  fireEvent.click(screen.getByRole('button', { name: 'Export Session' }))
  const saved = parseSessionJSON(serializeSession(download.mock.calls[0][0]))
  expect(saved.source).toBe('live')
  expect(saved.video.mimeType).toBe('video/mp4')
  expect(saved.video.filename).toMatch(/\.mp4$/)
  expect(saved.samples).toEqual(fixture.samples)
  expect(saved.transcription?.text).toBe('Grabación')
  vi.mocked(analyzeVocal).mockResolvedValueOnce(vocalFixture())
  fireEvent.change(screen.getByLabelText('Analysis to run'), { target: { value: 'vocal' } })
  fireEvent.click(screen.getByRole('button', { name: 'Analyze again' }))
  fireEvent.click(screen.getByRole('button', { name: 'Run selected analysis' }))
  await screen.findByText(/s windows, no overlap/)
  expect(vi.mocked(analyzeVocal).mock.calls[0][0]).toBe(vi.mocked(transcribeVideo).mock.calls[0][0])
  expect(analyzeVideo).toHaveBeenCalledOnce()
  expect(transcribeVideo).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Export Session' }))
  const vocalSaved = parseSessionJSON(serializeSession(download.mock.calls.at(-1)![0]))
  expect(vocalSaved.source).toBe('live')
  expect(vocalSaved.vocal?.samples).toEqual(vocalFixture().samples)
  expect(vocalSaved.transcription?.text).toBe('Grabación')
})
it('stops both devices when leaving before recording, and preserves the upload alternative on unsupported browsers', async () => {
  const media = installMedia()
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Record Video' }))
  fireEvent.click(screen.getByRole('button', { name: 'Enable camera & microphone' }))
  await screen.findByText('Camera and microphone ready.')
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(media.video.stop).toHaveBeenCalledOnce()
  expect(media.audio.stop).toHaveBeenCalledOnce()
  expect(screen.getByLabelText('Choose a video')).toBeDefined()
  vi.stubGlobal('MediaRecorder', undefined)
  fireEvent.click(screen.getByRole('button', { name: 'Record Video' }))
  fireEvent.click(screen.getByRole('button', { name: 'Enable camera & microphone' }))
  await screen.findByText(/Recording requires HTTPS/)
  fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  expect(screen.getByLabelText('Choose a video')).toBeDefined()
})
