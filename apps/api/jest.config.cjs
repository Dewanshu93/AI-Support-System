/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }] },
  // Resolve the shared package from source so unit tests never depend on a stale build.
  moduleNameMapper: { '^@sd/shared$': '<rootDir>/../../packages/shared/src/index.ts' },
};
