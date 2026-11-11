import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['src/**/*.test.ts'] } },
      {
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.test.ts'],
          exclude: ['tests/e2e/field.test.ts'],
          testTimeout: 180_000,
          hookTimeout: 180_000,
          fileParallelism: false,
        },
      },
      // Real CrUX + PSI calls: needs INP_GOOGLE_API_KEY. Run with `npm run test:field`.
      { test: { name: 'field', include: ['tests/e2e/field.test.ts'], testTimeout: 600_000, fileParallelism: false } },
    ],
  },
});
