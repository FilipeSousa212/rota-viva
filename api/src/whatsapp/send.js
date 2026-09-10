import { modoDemo, registrar } from './caixa.js';

const VERSAO = process.env.WA_API_VERSION || 'v23.0';

function descrever(payload) {
  if (payload.type === 'text') return { tipo: 'texto', texto: payload.text.body };
  return {
    tipo: 'botoes',
    texto: payload.interactive.body.text,
    botoes: payload.interactive.action.buttons.map((b) => ({ id: b.reply.id, titulo: b.reply.title })),
  };
}

async function enviar(payload) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  // Modo demonstração, ou desenvolvimento sem credenciais: nada sai para o WhatsApp.
  // A mensagem só é registrada no console (e na tela /demo). Em produção, falta de credencial é erro.
  if (modoDemo() || !token || !phoneId) {
    if (!modoDemo() && process.env.NODE_ENV === 'production') {
      throw new Error('WHATSAPP_TOKEN/WHATSAPP_PHONE_ID ausentes');
    }
    const item = descrever(payload);
    registrar(payload.to, item);
    const botoes = item.botoes ? ` [${item.botoes.map((b) => b.titulo).join(' | ')}]` : '';
    console.log(`📤 [simulado] ${payload.to} ← ${item.texto.replace(/\n/g, ' ⏎ ')}${botoes}`);
    return;
  }

  const r = await fetch(`https://graph.facebook.com/${VERSAO}/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }),
  });
  if (!r.ok) console.error(`Falha ao enviar para ${payload.to}: HTTP ${r.status}`, await r.text());
}

export const enviarTexto = (to, body) => enviar({ to, type: 'text', text: { body } });

// O WhatsApp aceita no máximo 3 botões, com título de até 20 caracteres.
export const enviarBotoes = (to, texto, opcoes) => enviar({
  to,
  type: 'interactive',
  interactive: {
    type: 'button',
    body: { text: texto },
    action: {
      buttons: opcoes.map((o) => ({ type: 'reply', reply: { id: o.id, title: o.titulo } })),
    },
  },
});
