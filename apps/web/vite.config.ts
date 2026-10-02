/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      // Online-first (ADR-013): cache the app shell only, never API responses.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        globIgnores: ['**/mockServiceWorker.js'],
        navigateFallbackDenylist: [/^\/api\//, /mockServiceWorker\.js$/],
      },
      manifest: {
        name: 'RBP Business Platform',
        short_name: 'RBP',
        description: 'POS, restaurant, inventory and operations platform',
        theme_color: '#1e2a4a',
        background_color: '#f7f8fa',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
