import pg from 'pg';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (e) => console.error('Erro no pool do Postgres:', e));