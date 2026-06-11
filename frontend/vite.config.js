import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'strip-crossorigin',
      enforce: 'post',
      transformIndexHtml(html) {
        return html.replace(/\s+crossorigin/g, '')
      },
    },
  ],
  build: {
    target: ['es2018', 'safari12'],
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks: {
          'recharts':     ['recharts'],
          'markdown':     ['react-markdown'],
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://api:8000',
        changeOrigin: true,
      },
    },
  },
})
