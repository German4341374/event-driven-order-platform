import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import type { Config } from '../config.js';

const { Pool } = pg;

export type DatabasePool = InstanceType<typeof Pool>;

export function createPool(config: Config): DatabasePool {
  return new Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
}

export async function migrate(pool: DatabasePool): Promise<void> {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));
  const migrationPath = resolve(currentDirectory, '../../database/migrations/001_initial.sql');
  const sql = await readFile(migrationPath, 'utf8');

  await pool.query('SELECT pg_advisory_lock(739201)');
  try {
    const exists = await pool.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') AS exists",
    );
    if (!exists.rows[0]?.exists) {
      await pool.query(sql);
    }
  } finally {
    await pool.query('SELECT pg_advisory_unlock(739201)');
  }
}
