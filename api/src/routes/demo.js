import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { pool } from '../db.js';
import { processar } from '../whatsapp/flow.js';
import { esvaziar } from '../whatsapp/caixa.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

// Só telefones fictícios: DDI 55 + DDD 00, que não existe. Assim a demonstração
// nunca lê nem apaga a conversa ou a reserva de um cliente de verdade.
const TELEFONE_DEMO = /^55000\d{8}$/;

// Só é montado no server.js quando MODO_DEMO=1.
export const demo = Router();

demo.get('/', (_req, res) => res.sendFile(path.join(AQUI, '..', 'demo.html')));

demo.get('/info', (_req, res) => {
  res.json({ ia: process.env.ANTHROPIC_API_KEY ? 'claude' : 'demo' });
});

// Recebe o que a pessoa "digitou" na tela, monta uma mensagem no mesmo formato
// que a Meta entrega no webhook e passa pelo fluxo real.
demo.post('/mensagem', async (req, res) => {
  const { telefone, texto, botao } = req.body ?? {};
  if (!TELEFONE_DEMO.test(String(telefone))) return res.status(400).json({ erro: 'Telefone de demonstração inválido' });

  const id = 'demo.' + crypto.randomUUID();
  const msg = botao
    ? {
        id, from: telefone, type: 'interactive',
        interactive: {
          type: 'button_reply',
          button_reply: { id: String(botao.id).slice(0, 40), title: String(botao.titulo).slice(0, 20) },
        },
      }
    : { id, from: telefone, type: 'text', text: { body: String(texto ?? '').slice(0, 1000) } };

  esvaziar(telefone);
  await processar(msg);

  const { rows } = await pool.query(
    'SELECT etapa, contexto, falhas_ia, humano FROM conversas WHERE telefone = $1',
    [telefone]
  );
  const estado = rows[0] ?? null;
  if (estado) delete estado.contexto.historico; // a tela não precisa do histórico da IA

  res.json({ saida: esvaziar(telefone), estado });
});

demo.post('/reiniciar', async (req, res) => {
  const { telefone } = req.body ?? {};
  if (!TELEFONE_DEMO.test(String(telefone))) return res.status(400).json({ erro: 'Telefone de demonstração inválido' });

  await pool.query('DELETE FROM conversas WHERE telefone = $1', [telefone]);
  esvaziar(telefone);

  // Faxina: demonstrações abandonadas há mais de um dia.
  await pool.query(`DELETE FROM conversas WHERE telefone LIKE '55000%' AND atualizado < now() - interval '1 day'`);
  await pool.query(`DELETE FROM reservas  WHERE telefone LIKE '55000%' AND criado_em  < now() - interval '1 day'`);

  // Reserva de exemplo deste navegador, para o roteiro "Já sou cliente" (CPF começando em 123).
  await pool.query(
    `INSERT INTO reservas (telefone, cpf_prefixo, localizador, destino, data_ida, data_volta, voo, hotel, status)
     VALUES ($1, '123', $2, 'Maragogi, AL', current_date + 60, current_date + 67,
             'G3 1452 · GRU 07:40 → MCZ 10:55', 'Salinas Maragogi All Inclusive', 'emitida')
     ON CONFLICT (localizador) DO NOTHING`,
    [telefone, 'RV' + telefone.slice(-6)]
  );

  res.json({ ok: true });
});