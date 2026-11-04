export function vocalWasmPaths() {
  const safari = /Version\/(\d+).*Safari/.exec(navigator.userAgent)
  const suffix = safari && Number(safari[1]) < 26 && !('gpu' in navigator) ? '' : '.asyncify'
  return {
    mjs: `${self.location.origin}/stt-runtime/ort-wasm-simd-threaded${suffix}.mjs`,
    wasm: `${self.location.origin}/stt-runtime/ort-wasm-simd-threaded${suffix}.wasm`,
  }
}
