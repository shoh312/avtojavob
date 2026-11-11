import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backend = 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  build: { outDir: '../app/web', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: {
    proxy: {
      '/api': backend, '/instagram': backend, '/webhook': backend,
      '/privacy': backend, '/terms': backend, '/data-deletion': backend,
    },
  },
})
