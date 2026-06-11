import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/firebase.ts'],
      thresholds: { lines: 60, functions: 60 },
      reporter: ['text', 'lcov'],
    },
  },
});
