import { VocalClient as SharedClient } from '../../features/vocal/lib/client'
export class VocalClient extends SharedClient {
  constructor(
    progress: (message: string, done?: number, total?: number) => void,
    create = () => new Worker(new URL('./vocal.worker.ts', import.meta.url), { type: 'module' }),
  ) {
    super(progress, create)
  }
}
