import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { pool } from '../db.js';
import { processar } from '../whatsapp/flow.js';
import { esvaziar } from '../whatsapp/caixa.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const TELEFONE_VALIDO = /^\d{10,15}$/;

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
  if (!TELEFONE_VALIDO.test(String(telefone))) return res.status(400).json({ erro: 'Telefone inválido' });

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
  if (!TELEFONE_VALIDO.test(String(telefone))) return res.status(400).json({ erro: 'Telefone inválido' });
  await pool.query('DELETE FROM conversas WHERE telefone = $1', [telefone]);
  esvaziar(telefone);
  res.json({ ok: true });
});
