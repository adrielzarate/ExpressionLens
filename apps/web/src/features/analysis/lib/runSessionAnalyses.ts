import type {
  AnalysisOptions,
  AnalysisProgress,
  AnalysisSession,
  SessionVideoMetadata,
} from '../types'
import { analyzeVideo } from './analyzeVideo'
import { isAbortError, throwIfAborted } from './abort'
import { ANALYSIS_FPS } from './sampling'
import { emptyTranscription } from '../../speech/types'
import { analyzeVocal } from '../../vocal/lib/analyzeVocal'
import { emptyVocal } from '../../vocal/types'
import type { PreparedAudio } from '../../speech/lib/audio'
import { transcribeVideo } from '../../speech/lib/transcribeVideo'

export const analysisDependencies = {
  facial: analyzeVideo,
  speech: transcribeVideo,
  vocal: analyzeVocal,
  audio: async (file: File) => (await import('../../speech/lib/audio')).prepareAudio(file),
}
export async function runSessionAnalyses(
  url: string,
  video: SessionVideoMetadata,
  source: AnalysisSession['source'],
  options: AnalysisOptions,
  existing: AnalysisSession | null,
  signal: AbortSignal,
  publish: (session: AnalysisSession) => void,
  progress: (value: AnalysisProgress) => void,
  stage: (message: string) => void,
  deps: Pick<typeof analysisDependencies, 'facial' | 'speech'> &
    Partial<Pick<typeof analysisDependencies, 'vocal' | 'audio'>> = analysisDependencies,
): Promise<AnalysisSession> {
  if (!options.facial && !options.speech && !options.vocal)
    throw new Error('Select at least one analysis.')
  let session: AnalysisSession = existing ?? {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source,
    video,
    durationMs: video.durationMs,
    modelVersion: 'not-run',
    samplingFps: ANALYSIS_FPS,
    samples: [],
    facialStatus: 'not-requested',
    transcription: emptyTranscription(options.language),
    vocal: emptyVocal(),
  }
  // Publish successful outputs immediately, including before a later stage fails.
  const update = (value: Partial<AnalysisSession>) => {
    session = { ...session, ...value }
    publish(session)
  }
  throwIfAborted(signal)
  session = {
    ...session,
    selectedAnalyses: { facial: options.facial, speech: options.speech, vocal: !!options.vocal },
  }
  let sharedAudio: Promise<PreparedAudio> | undefined
  const audioForBoth = () => {
    if (!options.speech || !options.vocal) return undefined
    stage('Preparing shared audio for transcription and vocal expressions…')
    return (sharedAudio ??= (deps.audio ?? analysisDependencies.audio)(options.file))
  }
  if (options.facial) {
    stage('Loading facial model and analyzing facial expressions…')
    try {
      const result = await deps.facial(url, signal, progress)
      throwIfAborted(signal)
      update({
        samples: result.samples,
        samplingFps: result.samplingFps,
        modelVersion: result.modelVersion,
        facialStatus: 'completed',
        facialError: undefined,
      })
    } catch (error) {
      if (isAbortError(error) || signal.aborted) {
        if (!session.samples.length) update({ facialStatus: 'cancelled' })
        throw new DOMException('Analysis cancelled.', 'AbortError')
      }
      // Preserve any successful earlier facial run on a failed retry.
      update({
        facialStatus: session.samples.length ? 'completed' : 'error',
        facialError: error instanceof Error ? error.message : 'Facial analysis failed.',
      })
    }
  }
  throwIfAborted(signal)
  if (options.speech) {
    try {
      const transcription = await deps.speech(
        options.file,
        video.durationMs,
        options.language,
        signal,
        stage,
        await audioForBoth(),
      )
      throwIfAborted(signal)
      update({ transcription })
    } catch (error) {
      const previous = session.transcription
      const cancelled = isAbortError(error) || signal.aborted
      update({
        transcription:
          previous?.status === 'completed'
            ? {
                ...previous,
                error: cancelled
                  ? 'Retry abandoned; previous transcript retained.'
                  : error instanceof Error
                    ? error.message
                    : 'Speech retry failed.',
              }
            : {
                ...emptyTranscription(options.language),
                status: cancelled ? 'cancelled' : 'error',
                error: cancelled
                  ? 'Speech processing abandoned.'
                  : error instanceof Error
                    ? error.message
                    : 'Speech processing failed.',
              },
      })
      if (cancelled) throw new DOMException('Analysis cancelled.', 'AbortError')
    }
  }
  throwIfAborted(signal)
  if (options.vocal) {
    try {
      const prepared = await audioForBoth()
      throwIfAborted(signal)
      const vocal = await (deps.vocal ?? analysisDependencies.vocal)(
        options.file,
        video.durationMs,
        signal,
        stage,
        prepared,
      )
      throwIfAborted(signal)
      update({ vocal })
    } catch (error) {
      const cancelled = isAbortError(error) || signal.aborted
      const message = cancelled
        ? 'Vocal processing abandoned.'
        : error instanceof Error
          ? error.message
          : 'Vocal analysis failed.'
      const previous = session.vocal
      update({
        vocal:
          previous?.status === 'completed' || previous?.status === 'partial'
            ? { ...previous, error: message }
            : { ...emptyVocal(), status: cancelled ? 'cancelled' : 'error', error: message },
      })
      if (cancelled) throw new DOMException('Analysis cancelled.', 'AbortError')
    }
  }
  stage('Finalizing session…')
  return session
}
