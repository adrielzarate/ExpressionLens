import { useEffect, useState, useSyncExternalStore } from 'react'
import { createRecordingController } from '../lib/recorder'
import type { RecordedVideo } from '../lib/recorder'

export function useRecording(initial?: RecordedVideo | null) {
  const [controller] = useState(() => createRecordingController())
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  )
  useEffect(() => {
    controller.activate(initial)
    return () => controller.dispose()
  }, [controller, initial])
  return {
    ...snapshot,
    prepare: controller.prepare,
    start: controller.start,
    stop: controller.stop,
    cancel: controller.cancel,
  }
}
