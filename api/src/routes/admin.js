import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { pool } from '../db.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

export const admin = Router();

/* Comparação resistente a ataque de temporização. */
function igual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* Autenticação HTTP Basic — o navegador exibe a caixa de login sozinho. */
admin.use((req, res, next) => {
  const usuario = process.env.ADMIN_USER;
  const senha = process.env.ADMIN_PASS;

  if (!usuario || !senha) {
    return res.status(503).send('Painel indisponível: defina ADMIN_USER e ADMIN_PASS no .env');
  }

  const [tipo, credencial] = (req.get('authorization') || '').split(' ');
  if (tipo === 'Basic' && credencial) {
    const [u, s] = Buffer.from(credencial, 'base64').toString('utf8').split(':');
    if (u && s && igual(u, usuario) && igual(s, senha)) return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Painel Rota Viva", charset="UTF-8"');
  res.status(401).send('Acesso restrito.');
});

admin.get('/', (_req, res) => res.sendFile(path.join(AQUI, '..', 'painel.html')));

admin.get('/leads', async (req, res) => {
  const tipos = ['praia', 'campo', 'exterior'];
  const tipo = tipos.includes(req.query.tipo) ? req.query.tipo : null;
  const busca = String(req.query.q || '').slice(0, 60);

  const { rows: leads } = await pool.query(
    `SELECT id, nome, email, telefone, tipo_destino, data_ida, data_volta,
            adultos, criancas, preferencias, consentimento, consent_em, criado_em
       FROM leads
      WHERE ($1::text IS NULL OR tipo_destino = $1)
        AND ($2 = '' OR nome ILIKE '%' || $2 || '%'
                     OR telefone ILIKE '%' || $2 || '%'
                     OR email ILIKE '%' || $2 || '%')
      ORDER BY criado_em DESC
      LIMIT 300`,
    [tipo, busca]
  );

  const { rows: resumo } = await pool.query(
    `SELECT
       count(*)::int                                                   AS total,
       count(*) FILTER (WHERE criado_em >= current_date)::int          AS hoje,
       count(*) FILTER (WHERE criado_em >= current_date - 6)::int      AS semana,
       count(*) FILTER (WHERE tipo_destino = 'praia')::int             AS praia,
       count(*) FILTER (WHERE tipo_destino = 'campo')::int             AS campo,
       count(*) FILTER (WHERE tipo_destino = 'exterior')::int          AS exterior
     FROM leads`
  );

  res.json({ leads, resumo: resumo[0] });
});
