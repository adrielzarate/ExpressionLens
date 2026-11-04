import { installVocalWorker } from '../../features/vocal/lib/worker'
// Keep the Lab's existing default; its selector explicitly requests either adapter.
installVocalWorker('wav2vec2')
