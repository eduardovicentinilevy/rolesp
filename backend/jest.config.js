// Jest em modo ESM nativo (sem Babel). O npm test passa --experimental-vm-modules ao Node.
export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/tests/**/*.test.js'],
  globalSetup: './tests/helpers/prepararBanco.js',
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageReporters: ['text-summary', 'lcov'],
};
