/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  // evals/ (golden set validator and, later, the runner) is tested with the api.
  roots: ['<rootDir>/src', '<rootDir>/test', '<rootDir>/../../evals'],
  // API tests act as the web app: mutating requests carry the CSRF header (W4-07).
  setupFiles: ['<rootDir>/test/setup/csrfHeader.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }] },
  // Resolve the shared package from source so unit tests never depend on a stale build.
  moduleNameMapper: { '^@sd/shared$': '<rootDir>/../../packages/shared/src/index.ts' },
  // Every worker loads LangChain and builds Express apps: Jest's default (cores − 1 workers)
  // exhausts memory on an 8 GB machine and slow first tests time out. Half the cores, and
  // 15 s per test (the first test of a file also pays for building the app).
  maxWorkers: '50%',
  testTimeout: 15_000,
};
