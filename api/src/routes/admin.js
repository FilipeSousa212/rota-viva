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

// Duas contas, as duas só de leitura (o painel não altera nada): a da agência e a do
// cliente que está avaliando o sistema. Separadas para você poder cortar o acesso do
// cliente sem trocar a sua senha — basta apagar CLIENTE_PASS.
function contas() {
  return [
    { papel: 'agência', usuario: process.env.ADMIN_USER, senha: process.env.ADMIN_PASS },
    { papel: 'cliente', usuario: process.env.CLIENTE_USER, senha: process.env.CLIENTE_PASS },
  ].filter((c) => c.usuario && c.senha);
}

/* Autenticação HTTP Basic — o navegador exibe a caixa de login sozinho. */
admin.use((req, res, next) => {
  const lista = contas();
  if (!lista.length) {
    return res.status(503).send('Painel indisponível: defina ADMIN_USER e ADMIN_PASS no .env');
  }

  const [tipo, credencial] = (req.get('authorization') || '').split(' ');
  if (tipo === 'Basic' && credencial) {
    const texto = Buffer.from(credencial, 'base64').toString('utf8');
    const separador = texto.indexOf(':');
    if (separador > 0) {
      const u = texto.slice(0, separador);
      const s = texto.slice(separador + 1);
      // Confere todas as contas, sem parar na primeira, para o tempo de resposta não revelar qual existe.
      let conta = null;
      for (const c of lista) {
        const usuarioOk = igual(u, c.usuario);
        const senhaOk = igual(s, c.senha);
        if (usuarioOk && senhaOk && !conta) conta = c;
      }
      if (conta) {
        req.conta = conta;
        return next();
      }
    }
  }

  res.set('WWW-Authenticate', 'Basic realm="Painel Rota Viva", charset="UTF-8"');
  res.status(401).send('Acesso restrito.');
});

admin.get('/', (_req, res) => res.sendFile(path.join(AQUI, '..', 'painel.html')));

admin.get('/eu', (req, res) => res.json({ usuario: req.conta.usuario, papel: req.conta.papel }));

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

admin.get('/conversas', async (req, res) => {
  const busca = String(req.query.q || '').replace(/\D/g, '').slice(0, 15);

  const { rows: conversas } = await pool.query(
    `SELECT telefone, etapa, humano, falhas_ia, atualizado,
            contexto->>'tipo'                      AS tipo,
            contexto->>'datas'                     AS datas,
            contexto->>'localizador'               AS localizador,
            contexto->>'consentimentoEm'           AS consentimento_em,
            contexto->'historico'-> -2 ->>'content' AS ultima_duvida
       FROM conversas
      WHERE ($1 = '' OR telefone LIKE '%' || $1 || '%')
      ORDER BY atualizado DESC
      LIMIT 300`,
    [busca]
  );

  const { rows: resumo } = await pool.query(
    `SELECT
       count(*)::int                                                   AS total,
       count(*) FILTER (WHERE atualizado >= current_date)::int         AS hoje,
       count(*) FILTER (WHERE humano)::int                             AS com_consultor,
       count(*) FILTER (WHERE contexto ? 'consentimentoEm')::int       AS com_consentimento
     FROM conversas`
  );

  res.json({ conversas, resumo: resumo[0] });
});