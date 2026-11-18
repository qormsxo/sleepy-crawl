import { afterEach } from 'vitest';
import { closeTestDbs } from './helpers/db';

afterEach(async () => {
  await closeTestDbs();
});
