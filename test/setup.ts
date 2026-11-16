import { beforeEach } from 'vitest';

// Many tests here are synchronous and heavy (a whole voice read in one go), and vitest awaits each in turn without
// returning to the event loop. A worker then runs a minute or more without reading the coordinator's replies, and
// vitest fails the run with "Timeout calling onTaskUpdate" though every test passed. A turn of the event loop before
// each test lets those replies in.
beforeEach(() => new Promise<void>((done) => setImmediate(done)));
