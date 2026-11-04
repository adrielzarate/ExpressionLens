import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { VocalLab } from './Lab'
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VocalLab />
  </StrictMode>,
)
