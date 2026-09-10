export async function verificarRecaptcha(token, ip) {
  // Desligar o reCAPTCHA exige pedir explicitamente — nunca acontece por esquecimento.
  if (process.env.RECAPTCHA_DESATIVADO === '1') return true;

  if (!process.env.RECAPTCHA_SECRET) {
    console.error('✖ RECAPTCHA_SECRET não configurado: formulário recusado. Para testes, use RECAPTCHA_DESATIVADO=1.');
    return false;
  }

  const r = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret: process.env.RECAPTCHA_SECRET, response: token, remoteip: ip }),
  });
  const j = await r.json();
  return j.success === true && j.score >= 0.5 && j.action === 'cotacao';
}

// Remove tags HTML e caracteres de controle (\p{Cc}: quebras de linha, tabulação, nulos…).
export const limpar = (s) =>
  String(s).replace(/<[^>]*>/g, '').replace(/\p{Cc}/gu, '').trim();