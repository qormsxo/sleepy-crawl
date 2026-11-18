import { defineConfig } from 'vitest/config';
import path from 'node:path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    environment: 'node',
    testTimeout: 30000,
    setupFiles: ['tests/setup.ts'],
    // Each DB test runs an in-memory Postgres (PGlite/WASM); many parallel workers exhaust memory.
    maxWorkers: 2,
  },
});
