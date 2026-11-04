import type { VocalModelKey } from './models'
// Provisional product choice. Change only this value to 'wav2vec2' to revert.
// Historical sessions are resolved from their recorded metadata, never this setting.
export const ACTIVE_SER_MODEL: VocalModelKey = 'emotion2vec'
