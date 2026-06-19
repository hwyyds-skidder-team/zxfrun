import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://<user>.github.io/zxfrun/ on GitHub Pages
export default defineConfig({
  base: '/zxfrun/',
  plugins: [react()],
})
