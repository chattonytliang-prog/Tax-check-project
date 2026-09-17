import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['functions/api/points/points.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'functions/api/_points.js',
        'functions/api/points/index.js',
        'functions/api/admin/users/[id]/points.js',
        'functions/api/reports/index.js',
        'functions/api/ai/report.js',
      ],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
    },
  },
})
