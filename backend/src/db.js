import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
dotenv.config();

const { Pool } = pg;
const backendDirectory = fileURLToPath(new URL('../', import.meta.url));
const databaseUrl = process.env.DATABASE_URL;
const databaseHost = databaseUrl ? new URL(databaseUrl).hostname : '';
const isSupabaseDatabase =
  databaseHost.endsWith('.pooler.supabase.com') ||
  databaseHost.endsWith('.supabase.co');
const caFile = process.env.DATABASE_SSL_CA;

let ssl;
if (isSupabaseDatabase) {
  if (!caFile) {
    throw new Error('Set DATABASE_SSL_CA to Supabase prod-ca-2021.crt to verify the database certificate.');
  }
  const caPath = isAbsolute(caFile) ? caFile : resolve(backendDirectory, caFile);
  ssl = {
    ca: readFileSync(caPath, 'utf8'),
    rejectUnauthorized: true
  };
} else if (process.env.NODE_ENV === 'production') {
  ssl = { rejectUnauthorized: true };
} else {
  ssl = false;
}

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl
});
