import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  resolve: {
    alias: [
      // y-monaco imports the pre-0.56 deep path, which monaco-editor's `exports` map no longer
      // allows. Point it at the package entry so y-monaco shares our single Monaco instance.
      { find: /^monaco-editor\/esm\/vs\/editor\/editor\.api(\.js)?$/, replacement: 'monaco-editor' },
    ],
  },
  optimizeDeps: {
    // Monaco is large; pre-bundle it so first dev load is fast and workers resolve correctly.
    include: ['monaco-editor', 'y-monaco', 'yjs', 'y-websocket'],
  },
})
