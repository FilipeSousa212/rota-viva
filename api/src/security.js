export async function verificarRecaptcha(token, ip) {
  // Sem chave configurada em ambiente local, libera — NUNCA em produção.
  if (!process.env.RECAPTCHA_SECRET) {
    if (process.env.NODE_ENV === 'production') throw new Error('RECAPTCHA_SECRET ausente em produção');
    console.warn('⚠️  reCAPTCHA desativado (sem RECAPTCHA_SECRET). Só para desenvolvimento.');
    return true;
  }

  const r = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: process.env.RECAPTCHA_SECRET, response: token, remoteip: ip }),
  });
  const j = await r.json();
  return j.success === true && j.score >= 0.5 && j.action === 'cotacao';
}

export const limpar = (s) =>
  String(s).replace(/<[^>]*>/g, '').replace(/[\u0000-\u001F]/g, '').trim();