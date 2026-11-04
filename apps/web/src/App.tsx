import { VideoWorkspace } from './features/analysis/components/VideoWorkspace'
import './App.css'

export default function App() {
  return (
    <main className="product-shell">
      <header>
        <a className="product-brand" href="./">
          Expression<span>Lens</span>.
        </a>
        <span className="product-status">LOCAL VIDEO ANALYSIS</span>
      </header>
      <section className="product-intro">
        <p className="product-eyebrow">AI-powered expression analysis</p>
        <h1>
          A new perspective
          <br />
          on your interview.
        </h1>
        <p>Upload or record an interview, or reopen a saved analysis. Privately, on your device.</p>
      </section>
      <VideoWorkspace />
      <footer>
        Everything stays on your device. Recording includes microphone audio; facial analysis does
        not analyze audio. Download your recording and export its session before leaving to keep
        them.
      </footer>
    </main>
  )
}
