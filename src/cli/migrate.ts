import { loadConfig } from '../config.js';
import { createPool, migrate } from '../infrastructure/database.js';

const pool = createPool(loadConfig());
try {
  await migrate(pool);
  process.stdout.write('Database migration completed\n');
} finally {
  await pool.end();
}
