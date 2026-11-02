import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/simulador-financiamento-consorcio/',
  plugins: [react()],
  build: {
    // recharts sozinho tem ~525 kB (151 kB gzip); fica num chunk próprio, cacheável à parte.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          charts: ['recharts'],
          db: ['dexie'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
