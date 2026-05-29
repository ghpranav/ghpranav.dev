import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), cloudflare()],
  server: {
    // Cross-origin isolation — WebLLM uses SharedArrayBuffer for its
    // multi-threaded WASM runtime. Without these headers, WebGPU works but
    // multi-threaded inference doesn't, and you'll see console warnings.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    // Big WASM bundle — let Vite skip prebundling and load it on demand.
    exclude: ['@mlc-ai/web-llm'],
  },
})