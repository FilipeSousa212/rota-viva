import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { cotacao } from './routes/cotacao.js';
import { admin } from './routes/admin.js';
import { demo } from './routes/demo.js';
import { webhook } from './whatsapp/webhook.js';

const PORTA = Number(process.env.PORT) || 3000;
const MODO_DEMO = process.env.MODO_DEMO === '1';

const app = express();
app.set('trust proxy', 1);
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

if (MODO_DEMO) {
  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️  MODO_DEMO=1 em produção: o robô NÃO vai responder no WhatsApp de verdade.');
  }
  app.use('/demo', rateLimit({ windowMs: 60_000, max: 240 }), cspPaginas, demo);
}

app.get('/saude', (_req, res) => res.json({ ok: true }));

app.listen(PORTA, () => {
  console.log(`API em http://localhost:${PORTA}`);
  if (MODO_DEMO) console.log(`🧪 Demonstração em http://localhost:${PORTA}/demo`);
});
