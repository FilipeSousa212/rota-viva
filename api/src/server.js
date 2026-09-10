import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { cotacao } from './routes/cotacao.js';
import { admin } from './routes/admin.js';
import { demo } from './routes/demo.js';
import { webhook } from './whatsapp/webhook.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PORTA = Number(process.env.PORT) || 3000;
const MODO_DEMO = process.env.MODO_DEMO === '1';

// Demonstração e WhatsApp de verdade ao mesmo tempo misturariam clientes reais
// com a tela de testes. Recusa iniciar nessa combinação.
if (MODO_DEMO && process.env.WHATSAPP_TOKEN) {
  console.error('✖ MODO_DEMO=1 junto com WHATSAPP_TOKEN: desligue um dos dois no .env.');
  process.exit(1);
}

const app = express();

// Só confia no X-Forwarded-For quando há proxy na frente (Render, Cloudflare),
// e só no número de saltos informado. Sem proxy, qualquer um forjaria o próprio IP
// e escaparia do limite de envios.
const saltos = Number(process.env.TRUST_PROXY) || 0;
if (saltos > 0) app.set('trust proxy', saltos);

app.use(helmet());
app.use(cors({ origin: ['http://127.0.0.1:5500', 'http://localhost:5500'] })); // Live Server

// Webhook do WhatsApp — precisa do corpo cru para validar a assinatura HMAC,
// por isso vem antes do express.json.
app.use(
  '/webhook',
  rateLimit({ windowMs: 60_000, max: 600 }),
  express.raw({ type: 'application/json', limit: '256kb' }),
  webhook
);

app.use(express.json({ limit: '32kb' }));
app.use('/api/cotacao', rateLimit({ windowMs: 60_000, max: 5 }), cotacao);

// Páginas internas (painel e demonstração) — o helmet padrão bloqueia CSS/JS embutidos,
// então estas rotas usam uma política própria que libera só o necessário.
const cspPaginas = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
  },
});
app.use('/admin', rateLimit({ windowMs: 15 * 60_000, max: 120 }), cspPaginas, admin);
if (MODO_DEMO) app.use('/demo', rateLimit({ windowMs: 60_000, max: 240 }), cspPaginas, demo);

app.get('/saude', (_req, res) => res.json({ ok: true }));

// O site (pasta web/) servido pela própria API: um endereço só, sem CORS.
const cspSite = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", 'https://www.google.com', 'https://www.gstatic.com'], // reCAPTCHA
    frameSrc: ['https://www.google.com'],
    styleSrc: ["'self'", 'https://fonts.googleapis.com'],
    fontSrc: ['https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'", 'https://www.google.com'],
  },
});
app.use(cspSite, express.static(path.join(AQUI, '..', '..', 'web')));

// Erros: nunca devolve detalhes internos (trilha de pilha, caminhos) para quem chamou.
app.use((err, _req, res, _next) => {
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ erro: status === 500 ? 'Erro interno. Tente novamente.' : 'Requisição inválida.' });
});

app.listen(PORTA, () => {
  console.log(`API e site em http://localhost:${PORTA}`);
  if (MODO_DEMO) console.log(`🧪 Demonstração em http://localhost:${PORTA}/demo`);
  if (process.env.RECAPTCHA_DESATIVADO === '1') console.warn('⚠️  reCAPTCHA desativado (RECAPTCHA_DESATIVADO=1).');
});