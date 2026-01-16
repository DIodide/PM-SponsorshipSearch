import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // @ts-expect-error - Vite version mismatch with workspace root
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    allowedHosts: ['05c75e4c7a3d.ngrok-free.app', 'f6f844967574.ngrok-free.app', 'localhost', '127.0.0.1'],
  },
})
