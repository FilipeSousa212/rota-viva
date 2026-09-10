import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { verificarRecaptcha, limpar } from '../security.js';

export const cotacao = Router();

const Schema = z.object({
  nome: z.string().min(2).max(80),
  email: z.string().email().max(120),
  telefone: z.string().regex(/^[\d\s()+-]{10,20}$/),
  tipo: z.enum(['praia', 'campo', 'exterior']),
  dataIda: z.coerce.date(),
  dataVolta: z.coerce.date(),
  adultos: z.coerce.number().int().min(1).max(20),
  criancas: z.coerce.number().int().min(0).max(20),
  consentimento: z.literal('on'),
  recaptchaToken: z.string().min(10),
});

cotacao.post('/', async (req, res) => {
  const p = Schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ erro: 'Dados inválidos' });
  const d = p.data;

  if (d.dataVolta <= d.dataIda) return res.status(400).json({ erro: 'A volta deve ser depois da ida' });

  if (!(await verificarRecaptcha(d.recaptchaToken, req.ip)))
    return res.status(403).json({ erro: 'Verificação de segurança falhou' });

  const extras = Object.fromEntries(
    Object.entries(req.body)
      .filter(([k]) => ['resort', 'veiculo', 'passaporte', 'seguro'].includes(k))
      .map(([k, v]) => [k, limpar(v)])
  );

  await pool.query(
    `INSERT INTO leads (nome,email,telefone,tipo_destino,data_ida,data_volta,
                        adultos,criancas,preferencias,consentimento,consent_em,origem_ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,now(),$10)`,
    [limpar(d.nome), limpar(d.email), limpar(d.telefone), d.tipo, d.dataIda, d.dataVolta,
     d.adultos, d.criancas, extras, req.ip]
  );
  res.status(201).json({ ok: true });
});