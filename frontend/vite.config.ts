import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

// Dev: proxy API paths to the backend so the app and API share an origin
// (the refresh cookie is SameSite=Strict and scoped to /auth/session).
const api = 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: { proxy: { '^/auth/': api, '^/me(/|$)': api, '^/orgs(/|$)': api, '^/public/': api, '^/islamic/': api } },
})
