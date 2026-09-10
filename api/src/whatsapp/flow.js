import { pool } from '../db.js';
import { enviarTexto, enviarBotoes } from './send.js';
import { responderComIA } from './ai.js';
import { registrar } from './caixa.js';

const LIMITE_FALHAS_IA = 2;
const LIMITE_TENTATIVAS_CPF = 2;
const MAX_HISTORICO = 6;                 // 3 perguntas + 3 respostas guardadas para a IA
const UM_DIA_MS = 24 * 60 * 60 * 1000;

const PEDE_HUMANO = /\b(atendente|humano|consultor|pessoa real|falar com algu[eé]m)\b/i;
const PEDE_MENU = /^(menu|in[ií]cio|voltar|recome[cç]ar)$/i;

const BOTOES_LGPD = [
  { id: 'lgpd_sim', titulo: 'Sim, autorizo' },
  { id: 'lgpd_nao', titulo: 'Não autorizo' },
];
const BOTOES_MENU = [
  { id: 'cliente', titulo: 'Já sou cliente' },
  { id: 'cotacao', titulo: 'Quero viajar' },
];
const BOTOES_DESTINO = [
  { id: 'praia', titulo: 'Praia' },
  { id: 'campo', titulo: 'Campo / Serra' },
  { id: 'exterior', titulo: 'Exterior' },
];

/* ---------------- Estado da conversa ---------------- */

async function carregar(telefone) {
  const { rows } = await pool.query('SELECT * FROM conversas WHERE telefone = $1', [telefone]);
  if (rows[0]) return rows[0];
  const novo = await pool.query('INSERT INTO conversas (telefone) VALUES ($1) RETURNING *', [telefone]);
  return novo.rows[0];
}

function salvar(s) {
  return pool.query(
    `UPDATE conversas
        SET etapa = $2, contexto = $3, falhas_ia = $4, humano = $5, atualizado = now()
      WHERE telefone = $1`,
    [s.telefone, s.etapa, s.contexto, s.falhas_ia, s.humano]
  );
}

function lerMensagem(msg) {
  if (msg.type === 'text') return { texto: msg.text.body.trim(), botao: null };
  if (msg.type === 'interactive' && msg.interactive?.type === 'button_reply') {
    return { texto: msg.interactive.button_reply.title, botao: msg.interactive.button_reply.id };
  }
  return null; // áudio, imagem, figurinha, localização…
}

/* ---------------- Transbordo humano ---------------- */

async function transbordo(s, motivo) {
  s.humano = true;
  s.etapa = 'humano';
  await enviarTexto(s.telefone,
    'Certo! Já chamei um consultor da Rota Viva. Ele continua esta conversa por aqui em instantes. 🙋');
  notificarEquipe(s, motivo);
}

function notificarEquipe(s, motivo) {
  // TODO: trocar por e-mail, Slack ou uma fila no painel /admin.
  const { historico, ...resumo } = s.contexto;
  console.warn(`🔔 [equipe] ${s.telefone} — ${motivo} — ${JSON.stringify(resumo)}`);
  registrar(s.telefone, { tipo: 'equipe', motivo, resumo });
}

/* ---------------- Reservas ---------------- */

// As falhas de CPF valem por 24 h e não zeram ao voltar para o menu: sem isso,
// dava para tentar os 3 dígitos (1.000 combinações) indefinidamente.
function cpfBloqueado(s) {
  const ate = s.contexto.cpfBloqueadoAte;
  if (!ate) return false;
  if (new Date(ate) > new Date()) return true;
  s.contexto = { ...s.contexto, cpfBloqueadoAte: null, tentativasCpf: 0 }; // o bloqueio venceu
  return false;
}

async function buscarReserva(telefone, cpfPrefixo) {
  const { rows } = await pool.query(
    `SELECT localizador, destino, voo, hotel, status,
            to_char(data_ida, 'DD/MM/YYYY') AS ida,
            to_char(data_volta, 'DD/MM/YYYY') AS volta
       FROM reservas
      WHERE telefone = $1 AND cpf_prefixo = $2 AND status <> 'cancelada'
      ORDER BY data_ida DESC
      LIMIT 1`,
    [telefone, cpfPrefixo]
  );
  return rows[0] ?? null;
}

const STATUS_RESERVA = {
  confirmada: 'Confirmada — aguardando emissão',
  emitida: 'Bilhetes emitidos ✅',
  em_andamento: 'Viagem em andamento',
  concluida: 'Concluída',
};

function formatarReserva(r) {
  return [
    `*Reserva ${r.localizador}*`,
    r.destino,
    `${r.ida} a ${r.volta}`,
    r.voo && `✈️ ${r.voo}`,
    r.hotel && `🏨 ${r.hotel}`,
    `Status: ${STATUS_RESERVA[r.status] ?? r.status}`,
  ].filter(Boolean).join('\n');
}

/* ---------------- Fluxo ---------------- */

export async function processar(msg) {
  const s = await carregar(msg.from);
  const tel = s.telefone;
  const consentiu = Boolean(s.contexto.consentimentoEm);

  // Conversa parada há mais de 24 h volta para o bot, inclusive se estava com um consultor.
  const parada = Date.now() - new Date(s.atualizado).getTime() > UM_DIA_MS;
  if (parada && s.etapa !== 'inicio') {
    s.humano = false;
    s.falhas_ia = 0;
    if (consentiu) {
      s.etapa = 'menu';
      await enviarBotoes(tel, 'Que bom te ver de novo! Como posso ajudar hoje?', BOTOES_MENU);
      return salvar(s);
    }
    s.etapa = 'inicio';
  }

  // Com um consultor na conversa, o bot fica em silêncio.
  if (s.humano) return salvar(s);

  const entrada = lerMensagem(msg);
  if (!entrada) {
    await enviarTexto(tel, 'Por enquanto eu só consigo ler mensagens de texto. Pode escrever para mim? 🙂');
    return salvar(s);
  }
  const { texto, botao } = entrada;

  // Saídas que valem em qualquer ponto da conversa.
  if (PEDE_HUMANO.test(texto)) {
    await transbordo(s, 'cliente-pediu-atendente');
    return salvar(s);
  }
  if (consentiu && PEDE_MENU.test(texto)) {
    s.etapa = 'menu';
    await enviarBotoes(tel, 'Claro! Como posso ajudar?', BOTOES_MENU);
    return salvar(s);
  }

  if (s.etapa === 'encerrado') s.etapa = 'inicio'; // voltou depois de recusar: pergunta de novo

  switch (s.etapa) {
    case 'inicio':
      await enviarBotoes(tel,
        'Olá! Aqui é o assistente virtual da *Rota Viva Viagens*. ✈️\n\n' +
        'Para te atender, vou guardar seu número e as informações da sua viagem, ' +
        'conforme nossa Política de Privacidade (LGPD). Você autoriza?',
        BOTOES_LGPD);
      s.etapa = 'lgpd';
      break;

    case 'lgpd':
      if (botao === 'lgpd_sim' || /^(sim|s|autorizo|pode|ok)\b/i.test(texto)) {
        s.contexto = { ...s.contexto, consentimentoEm: new Date().toISOString() };
        await enviarBotoes(tel, 'Obrigado! Como posso ajudar?', BOTOES_MENU);
        s.etapa = 'menu';
      } else if (botao === 'lgpd_nao' || /^(n[aã]o|n)\b/i.test(texto)) {
        await enviarTexto(tel,
          'Tudo bem, respeitamos sua escolha. Sem a autorização não consigo seguir por aqui, ' +
          'mas você pode falar com a gente pelo telefone (11) 4000-0000.');
        s.etapa = 'encerrado';
      } else {
        await enviarBotoes(tel, 'Só preciso de uma confirmação antes de continuar. Você autoriza?', BOTOES_LGPD);
      }
      break;

    case 'menu':
      if (botao === 'cliente' || /cliente|reserva/i.test(texto)) {
        if (cpfBloqueado(s)) {
          await transbordo(s, 'cpf-bloqueado');
          break;
        }
        await enviarTexto(tel, 'Para sua segurança, digite os *3 primeiros números do seu CPF*.');
        s.etapa = 'auth';
      } else if (botao === 'cotacao' || /viajar|cota[cç][aã]o|or[cç]amento|pacote/i.test(texto)) {
        await enviarBotoes(tel, 'Que tipo de viagem você procura?', BOTOES_DESTINO);
        s.etapa = 'destino';
      } else {
        await enviarBotoes(tel, 'Toque em uma das opções abaixo 👇', BOTOES_MENU);
      }
      break;

    case 'auth': {
      const digitos = texto.replace(/\D/g, '');
      const reserva = digitos.length === 3 ? await buscarReserva(tel, digitos) : null;

      if (reserva) {
        s.contexto = { ...s.contexto, tentativasCpf: 0, cpfBloqueadoAte: null, localizador: reserva.localizador };
        await enviarTexto(tel, formatarReserva(reserva));
        await enviarTexto(tel, 'Posso ajudar com mais alguma coisa sobre a viagem? Se preferir, digite *atendente*.');
        s.etapa = 'duvidas';
        break;
      }

      const tentativas = (s.contexto.tentativasCpf ?? 0) + 1;
      s.contexto = { ...s.contexto, tentativasCpf: tentativas };
      if (tentativas >= LIMITE_TENTATIVAS_CPF) {
        s.contexto = { ...s.contexto, cpfBloqueadoAte: new Date(Date.now() + UM_DIA_MS).toISOString() };
        await transbordo(s, 'nao-autenticou');
      } else {
        await enviarTexto(tel, 'Não consegui confirmar. Digite só os *3 primeiros números do seu CPF*, por favor.');
      }
      break;
    }

    case 'destino': {
      const tipo = ['praia', 'campo', 'exterior'].find((t) => botao === t || new RegExp(t, 'i').test(texto));
      if (!tipo) {
        await enviarBotoes(tel, 'Escolha uma das opções para eu te ajudar melhor:', BOTOES_DESTINO);
        break;
      }
      s.contexto = { ...s.contexto, tipo };
      await enviarTexto(tel,
        'Ótima escolha! Para quando é a viagem e quantas pessoas vão?\n' +
        'Exemplo: *10 a 17 de dezembro, 2 adultos e 1 criança*');
      s.etapa = 'datas';
      break;
    }

    case 'datas':
      s.contexto = { ...s.contexto, datas: texto.slice(0, 200) };
      await enviarTexto(tel,
        'Anotado! Um consultor vai te mandar as opções por aqui em até 1 hora. ' +
        'Enquanto isso, pode me perguntar o que quiser sobre o destino: clima, documentos, bagagem…');
      notificarEquipe(s, 'nova-cotacao');
      s.etapa = 'duvidas';
      break;

    case 'duvidas':
    default: {
      const historico = s.contexto.historico ?? [];
      const r = await responderComIA(texto, { historico, tipo: s.contexto.tipo });

      if (r.tipo === 'resposta') {
        s.falhas_ia = 0;
        s.contexto = {
          ...s.contexto,
          historico: [...historico, { role: 'user', content: texto }, { role: 'assistant', content: r.texto }]
            .slice(-MAX_HISTORICO),
        };
        await enviarTexto(tel, r.texto);
      } else if (r.tipo === 'transbordo') {
        await transbordo(s, 'assunto-para-consultor');
      } else if (r.tipo === 'indisponivel') {
        await transbordo(s, `ia-indisponivel: ${r.motivo}`);
      } else {
        s.falhas_ia += 1;
        if (s.falhas_ia >= LIMITE_FALHAS_IA) {
          await transbordo(s, 'ia-nao-entendeu-2x');
        } else {
          await enviarTexto(tel, 'Essa eu não entendi. Pode reformular? Se preferir, digite *atendente*.');
        }
      }
    }
  }

  await salvar(s);
}