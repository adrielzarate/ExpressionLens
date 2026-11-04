// The media element owns playback state/time. One callback is scheduled only
// while playing; native events also cover paused seeks, restart and ended.
function startVideoClock(video: HTMLVideoElement, onTime: (milliseconds: number) => void) {
  let disposed = false
  let pending: number | null = null
  const frameAPI =
    typeof video.requestVideoFrameCallback === 'function' &&
    typeof video.cancelVideoFrameCallback === 'function'
  const read = () => {
    if (!disposed)
      onTime(Number.isFinite(video.currentTime) ? Math.max(0, video.currentTime * 1000) : 0)
  }
  const cancel = () => {
    if (pending === null) return
    if (frameAPI) video.cancelVideoFrameCallback(pending)
    else cancelAnimationFrame(pending)
    pending = null
  }
  const schedule = () => {
    if (disposed || pending !== null || video.paused || video.ended) return
    const tick = () => {
      pending = null
      read()
      schedule()
    }
    pending = frameAPI ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick)
  }
  const update = () => {
    read()
    if (video.paused || video.ended) cancel()
    else schedule()
  }
  const events = [
    'timeupdate',
    'play',
    'pause',
    'seeking',
    'seeked',
    'ended',
    'loadedmetadata',
    'emptied',
  ]
  for (const name of events) video.addEventListener(name, update)
  update()
  return () => {
    disposed = true
    cancel()
    for (const name of events) video.removeEventListener(name, update)
  }
}

const clocks = new WeakMap<
  HTMLVideoElement,
  { listeners: Set<(ms: number) => void>; dispose: () => void }
>()
export function subscribeVideoClock(
  video: HTMLVideoElement,
  onTime: (milliseconds: number) => void,
) {
  let clock = clocks.get(video)
  if (!clock) {
    const listeners = new Set<(ms: number) => void>()
    const dispose = startVideoClock(video, (ms) => {
      for (const listener of listeners) listener(ms)
    })
    clock = { listeners, dispose }
    clocks.set(video, clock)
  }
  clock.listeners.add(onTime)
  onTime(Number.isFinite(video.currentTime) ? Math.max(0, video.currentTime * 1000) : 0)
  const current = clock
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    current.listeners.delete(onTime)
    if (!current.listeners.size) {
      current.dispose()
      clocks.delete(video)
    }
  }
}
