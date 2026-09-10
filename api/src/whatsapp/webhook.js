import crypto from 'node:crypto';
import { Router } from 'express';
import { processar } from './flow.js';

export const webhook = Router();

// 1) Aperto de mão: a Meta chama este GET ao cadastrar o webhook e espera o
//    hub.challenge de volta, mas só se o token de verificação bater.
webhook.get('/', (req, res) => {
  const esperado = process.env.WA_VERIFY_TOKEN;
  const { 'hub.mode': modo, 'hub.verify_token': token, 'hub.challenge': desafio } = req.query;

  if (esperado && modo === 'subscribe' && token === esperado) {
    return res.status(200).type('text/plain').send(String(desafio));
  }
  res.sendStatus(403);
});

// 2) Mensagens: só aceita corpo assinado com a Chave Secreta do App (HMAC-SHA256).
//    Sem isso, qualquer pessoa poderia forjar mensagens para o sistema.
webhook.post('/', (req, res) => {
  const segredo = process.env.WA_APP_SECRET;
  if (!segredo) return res.sendStatus(503);
  if (!Buffer.isBuffer(req.body)) return res.sendStatus(400);

  const recebida = Buffer.from(req.get('x-hub-signature-256') || '');
  const esperada = Buffer.from(
    'sha256=' + crypto.createHmac('sha256', segredo).update(req.body).digest('hex')
  );
  if (recebida.length !== esperada.length || !crypto.timingSafeEqual(recebida, esperada)) {
    return res.sendStatus(401);
  }

  // Responde logo: a Meta reenvia o evento se demorarmos.
  res.sendStatus(200);

  let dados;
  try { dados = JSON.parse(req.body.toString('utf8')); } catch { return; }

  for (const entrada of dados.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      for (const msg of mudanca.value?.messages ?? []) {
        if (jaVisto(msg.id)) continue;
        enfileirar(msg.from, () => processar(msg));
      }
    }
  }
});

// A Meta pode entregar o mesmo evento mais de uma vez — ignora repetidos.
const vistos = new Set();
function jaVisto(id) {
  if (vistos.has(id)) return true;
  vistos.add(id);
  if (vistos.size > 5000) vistos.delete(vistos.values().next().value);
  return false;
}

// Mensagens do mesmo cliente são processadas uma de cada vez, na ordem,
// para duas mensagens rápidas não pisarem no estado uma da outra.
const filas = new Map();
function enfileirar(telefone, tarefa) {
  const anterior = filas.get(telefone) ?? Promise.resolve();
  const atual = anterior
    .then(tarefa)
    .catch((e) => console.error(`Erro no fluxo de ${telefone}:`, e))
    .finally(() => { if (filas.get(telefone) === atual) filas.delete(telefone); });
  filas.set(telefone, atual);
}
