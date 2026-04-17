import { defineConfig, configDefaults } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals: true,
    fileParallelism: false,
    environment: 'jsdom',
    exclude: [...configDefaults.exclude, 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['lib/**/*.ts', 'app/components/**/*.tsx'],
      exclude: [
        '**/__tests__/**',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.test.tsx',
        'mcp-servers/**',
      ],
      reportsDirectory: './coverage',
      reportOnFailure: true,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
