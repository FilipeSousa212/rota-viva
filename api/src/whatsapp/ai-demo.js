// Respostas prontas para demonstrar o agente sem chave da Anthropic.
// Seguem o mesmo contrato do ai.js: mesmos tipos de retorno e as mesmas regras
// de transbordo (preço, reserva e reclamação vão para o consultor).
// Edite à vontade — as regras são avaliadas na ordem, e a primeira que casar responde.

const CLIMA = {
  praia: 'No litoral do Nordeste faz calor o ano todo, com médias entre 27 e 30 °C. ' +
    'De setembro a março chove pouco; de abril a julho chove mais, mas os preços costumam cair.',
  campo: 'Na serra os dias são amenos e as noites frias, principalmente de maio a agosto, ' +
    'quando a mínima pode ficar perto de 5 °C. Leve casaco e calçado fechado para as trilhas.',
  exterior: 'Depende do destino. Em Santiago, por exemplo, o inverno vai de junho a agosto, ' +
    'com mínimas perto de 0 °C e neve nas estações de esqui; o verão é quente e seco.',
};

const REGRAS = [
  { teste: /pre[cç]o|quanto (custa|fica|sai)|valor|or[cç]amento|desconto|promo[cç][aã]o/i, tipo: 'transbordo' },
  { teste: /cancel|reembols|estorno|alterar|remarcar|trocar a data|reclama/i, tipo: 'transbordo' },
  {
    teste: /crian[cç]a|beb[eê]|filh|menor de idade/i,
    texto: 'Em viagens nacionais, menores de 16 anos sem os pais precisam de autorização registrada em cartório; ' +
      'com um dos pais, basta documento com foto ou certidão de nascimento. Para o exterior, se a criança for ' +
      'com só um dos pais, o outro assina uma autorização com firma reconhecida.',
  },
  {
    teste: /passaporte|visto|documento|\brg\b|identidade/i,
    texto: 'No Brasil basta um documento oficial com foto (RG ou CNH). Para Argentina, Chile, Uruguai e demais ' +
      'países do Mercosul, o RG em bom estado também vale. Nos outros destinos é passaporte, e muitos países ' +
      'exigem validade mínima de 6 meses. Regras de visto mudam, então o consultor confirma para o seu caso.',
  },
  {
    teste: /bagagem|mala|despach|peso/i,
    texto: 'Nos voos nacionais, a tarifa básica costuma incluir só a bagagem de mão, de 10 a 12 kg conforme a ' +
      'companhia. A mala despachada de 23 kg geralmente é cobrada à parte. Na sua cotação o consultor já indica ' +
      'o que está incluso.',
  },
  {
    teste: /vacina|febre amarela/i,
    texto: 'Alguns países exigem o Certificado Internacional de Vacinação contra febre amarela (CIVP), e a vacina ' +
      'precisa ser tomada pelo menos 10 dias antes do embarque. O consultor confirma se o seu destino pede.',
  },
  {
    teste: /clima|chuva|chove|frio|calor|temperatura|[eé]poca|esta[cç][aã]o/i,
    texto: (tipo) => CLIMA[tipo] ??
      'Depende bastante do destino. Me conta para onde você quer ir que eu te digo como costuma ser o clima.',
  },
  {
    teste: /seguro/i,
    texto: 'Recomendamos seguro viagem sempre, e para a Europa ele pode ser exigido na imigração. Cobre despesas ' +
      'médicas, bagagem extraviada e cancelamentos, conforme o plano. Dá para incluir na sua cotação.',
  },
  {
    teste: /pix|cart[aã]o|boleto|parcel|pagamento|pagar/i,
    texto: 'Aceitamos PIX, cartão de crédito e boleto. As condições de parcelamento vêm junto com a sua cotação.',
  },
  { teste: /obrigad|valeu/i, texto: 'Por nada! Se surgir outra dúvida, é só chamar. 😊' },
  {
    teste: /\b(oi|ol[aá]|bom dia|boa tarde|boa noite)\b/i,
    texto: 'Olá! Pode mandar sua dúvida sobre a viagem: clima, documentos, bagagem…',
  },
];

export function responderDemo(pergunta, tipo) {
  const regra = REGRAS.find((r) => r.teste.test(pergunta));
  if (!regra) return { tipo: 'nao_entendi' };
  if (regra.tipo) return { tipo: regra.tipo };
  return { tipo: 'resposta', texto: typeof regra.texto === 'function' ? regra.texto(tipo) : regra.texto };
}
