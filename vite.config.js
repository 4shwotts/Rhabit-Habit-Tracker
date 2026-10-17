import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // mirror the Vercel rewrite in development: the browser only ever talks to
    // the frontend origin, so the session cookie is first-party
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
})
