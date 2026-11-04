import type { Request, Response } from './protocol'
// One Worker and one outstanding operation. Termination rejects pending work;
// late messages from an abandoned Worker can never resolve a newer operation.
export class VocalClient {
  private worker: Worker
  private pending?: { resolve(value: Response): void; reject(error: Error): void }
  constructor(
    onProgress: (message: string, done?: number, total?: number) => void,
    create = () => new Worker(new URL('./vocal.worker.ts', import.meta.url), { type: 'module' }),
  ) {
    this.worker = create()
    this.worker.onmessage = ({ data }: MessageEvent<Response>) => {
      if (data.type === 'progress') {
        onProgress(data.message, data.done, data.total)
        return
      }
      const pending = this.pending
      this.pending = undefined
      if (data.type === 'error') pending?.reject(new Error(data.message))
      else pending?.resolve(data)
    }
    this.worker.onerror = (event) => {
      this.pending?.reject(
        new Error(event.message || 'Vocal Worker failed. Abandon and reload the model.'),
      )
      this.pending = undefined
    }
  }
  request(request: Request, transfer: Transferable[] = []): Promise<Response> {
    if (this.pending) return Promise.reject(new Error('A model operation is already running.'))
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject }
      try {
        this.worker.postMessage(request, transfer)
      } catch (error) {
        this.pending = undefined
        reject(error)
      }
    })
  }
  terminate() {
    this.worker.onmessage = null
    this.worker.onerror = null
    this.worker.terminate()
    this.pending?.reject(new Error('Experiment abandoned.'))
    this.pending = undefined
  }
}
