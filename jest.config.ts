import type { Config } from 'jest';

const config: Config = {
  // Use ts-jest to transform TypeScript source files.
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Only pick up unit tests under src/ — never touch tests/e2e/ (those are Vitest).
  // This keeps Jest and Vitest from colliding on the same spec files.
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/tests/e2e/'],

  // Resolve @/* path aliases (mirrors tsconfig.json paths).
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // ts-jest config: use project tsconfig, but disable noEmit for transform.
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { noEmit: false } }],
  },

  // --passWithNoTests: no unit tests exist yet (added in Phase 3–6).
  // The CI job uses this flag via the npm test script; setting it here too
  // ensures local runs don't fail before any tests are written.
  passWithNoTests: true,
};

export default config;
