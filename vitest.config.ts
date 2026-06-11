import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/firebase.ts', 'src/lib/adminAuth.ts'],
      thresholds: { lines: 70, functions: 70 },
      reporter: ['text', 'lcov'],
    },
  },
});
