import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    define: {
        'process.env.NODE_ENV': '"production"'
    },
    publicDir: false, // Don't copy public assets, main build does that
    build: {
        emptyOutDir: false, // Don't wipe dist
        outDir: 'dist',
        rollupOptions: {
            input: {
                content: resolve(__dirname, 'src/content/index.tsx'),
            },
            output: {
                entryFileNames: '[name].js',
                // Bundle everything into the entry
                inlineDynamicImports: true,
                extend: true,
                format: 'iife' // IIFE is best for content scripts to avoid variable leaking and loading issues
            }
        }
    }
})
