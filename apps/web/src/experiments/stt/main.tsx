import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SpeechExperiment } from './SpeechExperiment'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpeechExperiment />
  </StrictMode>,
)
