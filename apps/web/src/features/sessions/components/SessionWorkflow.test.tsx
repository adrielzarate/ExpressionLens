import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../../../App'
import { transcribeVideo } from '../../speech/lib/transcribeVideo'
import { emptyTranscription } from '../../speech/types'
import { analyzeVideo } from '../../analysis/lib/analyzeVideo'
import { createFaceLandmarker, loadDefaultClassifier } from '@expressionlens/classifier'
import { serializeSession, MAX_SESSION_BYTES } from '../lib/serialization'
import { sessionFixture } from '../test/fixtures'

vi.mock('../../speech/lib/transcribeVideo', () => ({ transcribeVideo: vi.fn() }))
vi.mock('../../analysis/lib/analyzeVideo', () => ({ analyzeVideo: vi.fn() }))
vi.mock('@expressionlens/classifier', () => ({
  createFaceLandmarker: vi.fn(),
  loadDefaultClassifier: vi.fn(),
}))
const revoke = vi.fn(),
  create = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  let index = 0
  create.mockImplementation(() => `blob:video-${++index}`)
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create
      static revokeObjectURL = revoke
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
function jsonFile(json: string) {
  const file = new File([json], 'session.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: vi.fn(async () => json) })
  return file
}
async function importFile(json = serializeSession(sessionFixture())) {
  fireEvent.change(screen.getByLabelText('Import Session'), { target: { files: [jsonFile(json)] } })
  await screen.findByRole('heading', { name: 'Your analysis summary' })
}
function connect(filename = 'interview.mp4') {
  fireEvent.change(screen.getByLabelText('Select Original Video'), {
    target: { files: [new File(['video'], filename, { type: 'video/mp4' })] },
  })
  const video = screen.getByLabelText('Selected video preview') as HTMLVideoElement
  Object.defineProperties(video, {
    duration: { value: 1 },
    videoWidth: { value: 640 },
    videoHeight: { value: 480 },
  })
  fireEvent.loadedMetadata(video)
  return video
}
it('restores results without video or inference and permits offline prediction/event exploration', async () => {
  render(<App />)
  await importFile()
  expect(screen.getByRole('heading', { name: 'No video connected' })).toBeDefined()
  expect(screen.queryByLabelText('Selected video preview')).toBeNull()
  expect(screen.getByRole('button', { name: 'Export Session' })).toBeDefined()
  const slider = screen.getByRole('slider', { name: 'Explore session by expression timeline' })
  fireEvent.change(slider, { target: { value: '650' } })
  const tooltip = screen.getByRole('tooltip')
  expect(within(tooltip).getByRole('heading', { name: 'Smile' })).toBeDefined()
  expect(tooltip.textContent).toContain('00:00.600')
  fireEvent.click(screen.getByRole('button', { name: 'Next event' }))
  expect((slider as HTMLInputElement).value).toBe('800')
  expect(screen.getByLabelText('Current review position').textContent).toBe('00:00.800')
  expect(create).not.toHaveBeenCalled()
  expect(analyzeVideo).not.toHaveBeenCalled()
  expect(createFaceLandmarker).not.toHaveBeenCalled()
  expect(loadDefaultClassifier).not.toHaveBeenCalled()
})
it('links matching metadata, synchronizes the same video and disconnects without dropping results', async () => {
  render(<App />)
  await importFile()
  const video = connect()
  expect(screen.getByText(/Metadata matching is not cryptographic verification/)).toBeDefined()
  const slider = screen.getByRole('slider', { name: 'Seek video by expression timeline' })
  fireEvent.change(slider, { target: { value: '650' } })
  expect(video.currentTime).toBe(0.65)
  video.currentTime = 0.2
  fireEvent.seeked(video)
  expect((slider as HTMLInputElement).value).toBe('200')
  fireEvent.click(screen.getByRole('button', { name: 'Disconnect video' }))
  expect(screen.getByRole('heading', { name: 'Your analysis summary' })).toBeDefined()
  expect(screen.queryByLabelText('Selected video preview')).toBeNull()
  expect(
    screen.getByRole('slider', { name: 'Explore session by expression timeline' }),
  ).toBeDefined()
  expect(revoke).toHaveBeenCalledWith('blob:video-1')
  expect(analyzeVideo).not.toHaveBeenCalled()
  expect(loadDefaultClassifier).not.toHaveBeenCalled()
})
it('requires explicit confirmation before linking a metadata mismatch', async () => {
  render(<App />)
  await importFile()
  const video = connect('different.mp4')
  expect(screen.getByRole('region', { name: 'Video metadata mismatch' })).toBeDefined()
  video.currentTime = 0.4
  fireEvent.seeked(video)
  expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('0')
  expect(screen.getByRole('heading', { name: 'No video connected' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: 'Use this video anyway' }))
  expect(
    (screen.getByRole('slider', { name: 'Seek video by expression timeline' }) as HTMLInputElement)
      .value,
  ).toBe('400')
  expect(screen.queryByRole('region', { name: 'Video metadata mismatch' })).toBeNull()
  expect(analyzeVideo).not.toHaveBeenCalled()
})
it('preserves current results/video on failed import, stages valid replacement, and clears stale video only after confirmation', async () => {
  render(<App />)
  await importFile()
  const originalVideo = connect()
  fireEvent.change(screen.getByLabelText('Import Session'), {
    target: { files: [jsonFile('{broken')] },
  })
  await screen.findByText('The session file is not valid JSON.')
  expect(screen.getByLabelText('Selected video preview')).toBe(originalVideo)
  expect(revoke).not.toHaveBeenCalled()
  const next = {
    ...sessionFixture(),
    id: 'new-session',
    video: { ...sessionFixture().video!, filename: 'new.mp4' },
  }
  const json = serializeSession(next)
  fireEvent.change(screen.getByLabelText('Import Session'), { target: { files: [jsonFile(json)] } })
  await screen.findByRole('region', { name: 'Confirm session replacement' })
  expect(screen.getByLabelText('Selected video preview')).toBe(originalVideo)
  fireEvent.click(screen.getByRole('button', { name: 'Keep current session' }))
  expect(screen.getByLabelText('Selected video preview')).toBe(originalVideo)
  fireEvent.change(screen.getByLabelText('Import Session'), { target: { files: [jsonFile(json)] } })
  await screen.findByRole('region', { name: 'Confirm session replacement' })
  fireEvent.click(screen.getByRole('button', { name: 'Replace session' }))
  expect(screen.queryByLabelText('Selected video preview')).toBeNull()
  expect(screen.getByText('new.mp4')).toBeDefined()
  originalVideo.currentTime = 0.8
  fireEvent.seeked(originalVideo)
  expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('0')
  expect(revoke).toHaveBeenCalledWith('blob:video-1')
  expect(
    screen.getByRole('slider', { name: 'Explore session by expression timeline' }),
  ).toBeDefined()
  expect(analyzeVideo).not.toHaveBeenCalled()
})
it('rejects oversized imports before reading the file', async () => {
  render(<App />)
  const file = jsonFile('{}')
  Object.defineProperty(file, 'size', { value: MAX_SESSION_BYTES + 1 })
  fireEvent.change(screen.getByLabelText('Import Session'), { target: { files: [file] } })
  await screen.findByText('Session file exceeds 50 MiB.')
  expect(file.text).not.toHaveBeenCalled()
})
it('confirms clearing a saved session before selecting a video for new analysis', async () => {
  render(<App />)
  await importFile()
  const file = new File(['video'], 'new.mp4', { type: 'video/mp4' })
  fireEvent.change(screen.getByLabelText('Analyze another video'), { target: { files: [file] } })
  expect(screen.getByRole('region', { name: 'Confirm analysis replacement' })).toBeDefined()
  expect(screen.getByRole('heading', { name: 'Your analysis summary' })).toBeDefined()
  fireEvent.click(screen.getByRole('button', { name: 'Keep current analysis' }))
  expect(screen.queryByLabelText('Selected video preview')).toBeNull()
  fireEvent.change(screen.getByLabelText('Analyze another video'), { target: { files: [file] } })
  fireEvent.click(screen.getByRole('button', { name: 'Replace analysis' }))
  expect(screen.queryByRole('heading', { name: 'Your analysis summary' })).toBeNull()
  expect(screen.getByLabelText('Selected video preview')).toBeDefined()
  expect(analyzeVideo).not.toHaveBeenCalled()
})

it('exports newly analyzed results with the selected video metadata using the same portable contract', async () => {
  const serialization = await import('../lib/serialization')
  const exported = vi.spyOn(serialization, 'downloadSession').mockImplementation(() => {})
  const original = sessionFixture()
  const { video: _video, ...result } = original
  vi.mocked(analyzeVideo).mockResolvedValueOnce(result)
  render(<App />)
  fireEvent.change(screen.getByLabelText('Choose a video'), {
    target: { files: [new File(['video'], 'interview.mp4', { type: 'video/mp4' })] },
  })
  const video = screen.getByLabelText('Selected video preview') as HTMLVideoElement
  Object.defineProperties(video, {
    duration: { value: 1 },
    videoWidth: { value: 640 },
    videoHeight: { value: 480 },
  })
  fireEvent.loadedMetadata(video)
  fireEvent.click(screen.getByRole('button', { name: 'Analyze video' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Export Session' }))
  expect(exported).toHaveBeenCalledOnce()
  expect(
    serialization.parseSessionJSON(serialization.serializeSession(exported.mock.calls[0][0])),
  ).toEqual({
    ...original,
    id: expect.any(String),
    createdAt: expect.any(String),
    vocal: { status: 'not-requested', samples: [] },
    selectedAnalyses: { facial: true, speech: false, vocal: false },
  })
  expect(analyzeVideo).toHaveBeenCalledOnce()
})

it('runs both analyses from an uploaded video and restores speech without invoking either service', async () => {
  vi.mocked(analyzeVideo).mockResolvedValueOnce(sessionFixture())
  vi.mocked(transcribeVideo).mockResolvedValueOnce({
    ...emptyTranscription('english'),
    status: 'completed',
    text: 'Uploaded speech',
    segments: [{ startMs: 100, endMs: 900, text: 'Uploaded speech' }],
  })
  const serialization = await import('../lib/serialization')
  const download = vi.spyOn(serialization, 'downloadSession').mockImplementation(() => {})
  render(<App />)
  fireEvent.change(screen.getByLabelText('Choose a video'), {
    target: { files: [new File(['video'], 'interview.mp4', { type: 'video/mp4' })] },
  })
  const video = screen.getByLabelText('Selected video preview') as HTMLVideoElement
  Object.defineProperties(video, {
    duration: { value: 1 },
    videoWidth: { value: 640 },
    videoHeight: { value: 480 },
  })
  fireEvent.loadedMetadata(video)
  fireEvent.change(screen.getByLabelText('Analysis to run'), { target: { value: 'both' } })
  fireEvent.click(screen.getByRole('button', { name: 'Analyze video' }))
  await screen.findByText('Uploaded speech', { selector: '.transcript-text' })
  expect(analyzeVideo).toHaveBeenCalledOnce()
  expect(transcribeVideo).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Export Session' }))
  const exported = download.mock.calls[0][0]
  expect(exported.samples).toEqual(sessionFixture().samples)
  cleanup()
  render(<App />)
  await importFile(serializeSession(exported))
  expect(screen.getByText('Uploaded speech', { selector: '.transcript-text' })).toBeDefined()
  expect(analyzeVideo).toHaveBeenCalledOnce()
  expect(transcribeVideo).toHaveBeenCalledOnce()
})

it('imports a speech-only session and reattaches its video without running facial or speech inference', async () => {
  const original = {
    ...sessionFixture(),
    samples: [],
    facialStatus: 'not-requested' as const,
    modelVersion: 'not-run',
    transcription: {
      ...emptyTranscription('spanish'),
      status: 'completed' as const,
      text: 'Solo voz',
      segments: [{ startMs: 100, endMs: 900, text: 'Solo voz' }],
    },
  }
  render(<App />)
  fireEvent.change(screen.getByLabelText('Import Session'), {
    target: { files: [jsonFile(serializeSession(original))] },
  })
  await screen.findByText('Solo voz', { selector: '.transcript-text' })
  expect(screen.queryByRole('heading', { name: 'Your analysis summary' })).toBeNull()
  const video = connect()
  fireEvent.click(screen.getByRole('button', { name: /00:00.100.*Solo voz/ }))
  expect(video.currentTime).toBe(0.1)
  const segment = screen.getByRole('button', { name: /00:00.100.*Solo voz/ })
  video.currentTime = 0.5
  fireEvent.timeUpdate(video)
  expect(segment.classList.contains('transcript-active')).toBe(true)
  fireEvent.pause(video)
  expect(segment.getAttribute('aria-current')).toBe('true')
  video.currentTime = 0.95
  fireEvent.seeked(video)
  expect(segment.classList.contains('transcript-active')).toBe(false)
  expect(analyzeVideo).not.toHaveBeenCalled()
  expect(transcribeVideo).not.toHaveBeenCalled()
})
it('restores all three v3 sources, reconnects one player and updates both timelines and transcript without inference', async () => {
  const { vocalFixture } = await import('../../vocal/test/fixtures')
  render(<App />)
  const session = {
    ...sessionFixture(),
    vocal: vocalFixture(),
    selectedAnalyses: { facial: true, speech: true, vocal: true },
    transcription: {
      ...emptyTranscription('english'),
      status: 'completed' as const,
      text: 'Hello',
      segments: [{ startMs: 0, endMs: 500, text: 'Hello' }],
    },
  }
  await importFile(serializeSession(session))
  const video = connect()
  expect((screen.getByLabelText('Analysis to run') as HTMLSelectElement).value).toBe('all')
  const transcript = screen.getByRole('button', { name: /00:00.000.*Hello/ })
  video.currentTime = 0.25
  fireEvent.timeUpdate(video)
  expect(transcript.getAttribute('aria-current')).toBe('true')
  expect(screen.getByTestId('active-vocal-interval')).toBeDefined()
  expect(
    (screen.getByRole('slider', { name: 'Seek video by expression timeline' }) as HTMLInputElement)
      .value,
  ).toBe('250')
  video.currentTime = 0.75
  fireEvent.seeked(video)
  fireEvent.pause(video)
  expect(transcript.getAttribute('aria-current')).toBeNull()
  expect(screen.getByLabelText('Vocal window details').textContent).toContain('silence gate')
  fireEvent.click(screen.getByRole('button', { name: 'Seek to vocal window start' }))
  expect(video.currentTime).toBe(0.5)
  expect(analyzeVideo).not.toHaveBeenCalled()
  expect(transcribeVideo).not.toHaveBeenCalled()
  expect(createFaceLandmarker).not.toHaveBeenCalled()
})
