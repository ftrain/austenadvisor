import { defineConfig } from 'vitest/config';

// Four workers at most: the tests load whole voices and keep a core busy for a minute at a time, and with a worker
// on every core one of them now and then fails to report in time, which fails a run whose tests all passed.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], testTimeout: 60000, hookTimeout: 120000, pool: 'forks', poolOptions: { forks: { maxForks: 4 } } },
});
