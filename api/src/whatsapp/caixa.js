// Caixa de saída do modo demonstração: guarda o que o robô "enviaria" para cada
// telefone, para a tela /demo exibir. Fora do modo demonstração, não faz nada.

const caixas = new Map();

export const modoDemo = () => process.env.MODO_DEMO === '1';

export function registrar(telefone, item) {
  if (!modoDemo()) return;
  if (!caixas.has(telefone)) caixas.set(telefone, []);
  caixas.get(telefone).push({ ...item, em: new Date().toISOString() });
}

export function esvaziar(telefone) {
  const itens = caixas.get(telefone) ?? [];
  caixas.delete(telefone);
  return itens;
}
