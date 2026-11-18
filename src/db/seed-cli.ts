import 'dotenv/config';
import { getDb } from './client';
import { seed } from './seed';

seed(getDb())
  .then(() => {
    console.log('seed: done');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
