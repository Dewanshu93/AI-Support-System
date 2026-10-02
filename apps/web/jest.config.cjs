const nextJest = require('next/jest.js');

const createJestConfig = nextJest({ dir: __dirname });

/** @type {import('jest').Config} */
module.exports = createJestConfig({
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@sd/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
});
