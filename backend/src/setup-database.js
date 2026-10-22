import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const schemaPath = fileURLToPath(new URL('../schema.sql', import.meta.url));

try {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing from backend/.env.');
  }

  const schema = await readFile(schemaPath, 'utf8');
  await pool.query(schema);

  const { rows } = await pool.query(`
    SELECT current_database() AS database_name,
           PostGIS_Version() AS postgis_version,
           to_regclass('public.users') IS NOT NULL AS users_table,
           to_regclass('public.providers') IS NOT NULL AS providers_table,
           to_regclass('public.services') IS NOT NULL AS services_table
  `);
  const result = rows[0];

  if (!result.users_table || !result.providers_table || !result.services_table) {
    throw new Error('The schema ran but one or more required app tables are missing.');
  }

  console.log(JSON.stringify({
    connected: true,
    database: result.database_name,
    postgis: result.postgis_version,
    usersTable: result.users_table,
    providersTable: result.providers_table,
    servicesTable: result.services_table
  }));
} catch (error) {
  console.error(`Database setup failed (${error.code || 'unknown'}): ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
