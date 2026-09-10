// Cria as tabelas que faltarem. Seguro rodar quantas vezes quiser: os scripts
// usam IF NOT EXISTS. Roda sozinho antes da API subir (npm start).
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ORDEM = ['schema.sql', '002_reservas.sql'];

const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
await cliente.connect();
try {
  for (const arquivo of ORDEM) {
    await cliente.query(fs.readFileSync(path.join(AQUI, arquivo), 'utf8'));
    console.log(`✔ ${arquivo}`);
  }
} finally {
  await cliente.end();
}