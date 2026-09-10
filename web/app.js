const API = 'http://localhost:3000/api/cotacao';
const SITE_KEY = 'SUA_SITE_KEY'; // troque quando criar a chave do reCAPTCHA

// ---------- Carrossel ----------
const trilho = document.getElementById('trilho');
document.getElementById('prox').onclick = () => trilho.scrollBy({ left: trilho.clientWidth, behavior: 'smooth' });
document.getElementById('ant').onclick  = () => trilho.scrollBy({ left: -trilho.clientWidth, behavior: 'smooth' });

// ---------- Campos dinâmicos por destino ----------
const CAMPOS = {
  praia:    [{ n: 'resort',  l: 'Regime',            o: ['Café da manhã', 'Meia pensão', 'All inclusive'] }],
  campo:    [{ n: 'veiculo', l: 'Precisa de carro?', o: ['Não', 'Compacto', 'SUV'] }],
  exterior: [
    { n: 'passaporte', l: 'Passaporte válido?', o: ['Sim', 'Não', 'Não sei'] },
    { n: 'seguro',     l: 'Seguro viagem',      o: ['Incluir', 'Já tenho'] },
  ],
};

const tipo = document.getElementById('tipo');
const alvo = document.getElementById('campos-dinamicos');

tipo.addEventListener('change', () => {
  alvo.innerHTML = '';
  (CAMPOS[tipo.value] || []).forEach((c) => {
    const label = document.createElement('label');
    label.textContent = c.l + ' ';
    const sel = document.createElement('select');
    sel.name = c.n;
    c.o.forEach((op) => sel.add(new Option(op, op)));
    label.appendChild(sel);
    alvo.appendChild(label);
  });
  calcular();
});

// ---------- Calculadora de orçamento ----------
const BASE_DIARIA = { praia: 480, campo: 390, exterior: 950 }; // R$ por adulto/dia
const out = document.getElementById('estimativa');

function calcular() {
  const t = tipo.value;
  const ida = new Date(document.getElementById('dataIda').value);
  const volta = new Date(document.getElementById('dataVolta').value);
  const dias = Math.round((volta - ida) / 86400000);
  const ad = +document.getElementById('adultos').value || 0;
  const cr = +document.getElementById('criancas').value || 0;

  if (!t || !(dias > 0)) { out.textContent = 'Preencha destino e datas para ver a estimativa'; return; }

  const total = BASE_DIARIA[t] * dias * (ad + cr * 0.6);
  out.textContent = `Estimativa: ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} `
    + `— ${dias} noites, ${ad} adulto(s), ${cr} criança(s). Valor de referência, sujeito a confirmação.`;
}
['dataIda', 'dataVolta', 'adultos', 'criancas'].forEach((id) =>
  document.getElementById(id).addEventListener('input', calcular));

// ---------- Envio ----------
async function tokenRecaptcha() {
  // Sem chave configurada, manda um token de teste (o backend libera em desenvolvimento).
  if (SITE_KEY === 'SUA_SITE_KEY' || typeof grecaptcha === 'undefined') return 'token-de-teste-local';
  return grecaptcha.execute(SITE_KEY, { action: 'cotacao' });
}

document.getElementById('form-cotacao').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fb = document.getElementById('feedback');

  if (!document.getElementById('consentimento').checked) {
    fb.textContent = 'Marque a autorização de contato para continuar.';
    return;
  }

  const dados = Object.fromEntries(new FormData(e.target).entries());
  fb.textContent = 'Enviando…';

  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...dados, recaptchaToken: await tokenRecaptcha() }),
    });
    if (r.status === 429) { fb.textContent = 'Muitas tentativas. Espere um minuto e tente de novo.'; return; }
    fb.textContent = r.ok
      ? 'Recebemos seu pedido! Vamos te chamar no WhatsApp em instantes.'
      : 'Confira os dados do formulário e tente novamente.';
    if (r.ok) e.target.reset();
  } catch {
    fb.textContent = 'Não conseguimos conectar. A API está rodando em localhost:3000?';
  }
});

// ---------- Banner de cookies ----------
const banner = document.getElementById('cookies');
if (!localStorage.getItem('consent')) banner.hidden = false;
document.getElementById('cookies-todos').onclick      = () => { localStorage.setItem('consent', 'todos');      banner.hidden = true; };
document.getElementById('cookies-essenciais').onclick = () => { localStorage.setItem('consent', 'essenciais'); banner.hidden = true; };