import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { cotacao } from './routes/cotacao.js';
import { admin } from './routes/admin.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: ['http://127.0.0.1:5500', 'http://localhost:5500'] })); // Live Server

// TODO Etapa 4 — webhook do WhatsApp (precisa do corpo cru para validar o HMAC):
// app.use('/webhook', express.raw({ type: 'application/json' }), webhook);

app.use(express.json({ limit: '32kb' }));
app.use('/api/cotacao', rateLimit({ windowMs: 60_000, max: 5 }), cotacao);

// Painel de leads — o helmet padrão bloqueia CSS/JS embutidos, então esta rota
// usa uma política própria que libera o painel e as fontes do Google.
const cspPainel = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
  },
});
app.use('/admin', rateLimit({ windowMs: 15 * 60_000, max: 120 }), cspPainel, admin);

app.get('/saude', (_req, res) => res.json({ ok: true }));

app.listen(3000, () => console.log('API em http://localhost:3000'));