import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// near-api-js uses Node.js built-ins (Buffer, crypto, etc.) that are not
// available in the browser by default. The nodePolyfills plugin shims them.
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills(),
  ],
})
