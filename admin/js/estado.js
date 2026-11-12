// O "estado" do painel: o que está publicado, o rascunho guardado no servidor e a cópia de trabalho
// (o que você está editando agora e ainda não salvou).

import { api, ErroApi } from './api.js';
import { conteudoVazio, diferencas, normalizar, validarConteudo } from './comum.js';
import { limparCache } from './site.js';

export const estado = {
  sessao: null,
  publicado: null, // { rev, em, conteudo }
  rascunho: null, // { rev, em, conteudo }
  trabalho: conteudoVazio(),
  salvando: false,
};

const ouvintes = new Set();
export function ouvir(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }
export function notificar() { for (const fn of [...ouvintes]) fn(); }

const copiar = (v) => JSON.parse(JSON.stringify(v));

/** O que será gravado: a cópia de trabalho depois de conferida e limpa. */
export function trabalhoConferido() {
  return validarConteudo(estado.trabalho);
}

export function temAlteracoesNaoSalvas() {
  if (!estado.rascunho) return false;
  return diferencas(estado.rascunho.conteudo, trabalhoConferido().conteudo).length > 0;
}

export function alteracoesPendentes() {
  if (!estado.publicado) return [];
  return diferencas(estado.publicado.conteudo, trabalhoConferido().conteudo);
}

export async function carregarConteudo() {
  const dados = await api('/conteudo');
  estado.publicado = dados.publicado;
  estado.rascunho = dados.rascunho;
  estado.trabalho = { ...conteudoVazio(), ...copiar(dados.rascunho.conteudo) };
  notificar();
}

export async function salvarRascunho() {
  if (estado.salvando) return false;
  const conferido = trabalhoConferido();
  if (!conferido.ok) throw new ErroApi(conferido.erros.join(' '), 422, { erros: conferido.erros });
  estado.salvando = true;
  notificar();
  try {
    const dados = await api('/rascunho', { metodo: 'PUT', corpo: { rev: estado.rascunho.rev, conteudo: conferido.conteudo } });
    estado.rascunho = dados.rascunho;
    limparCache('rascunho');
    return true;
  } finally {
    estado.salvando = false;
    notificar();
  }
}

export async function publicarAgora(nota) {
  if (temAlteracoesNaoSalvas()) await salvarRascunho();
  const dados = await api('/publicar', { metodo: 'POST', corpo: { nota } });
  estado.publicado = dados.publicado;
  limparCache();
  notificar();
}

export async function descartarAlteracoes() {
  const dados = await api('/descartar', { metodo: 'POST', corpo: {} });
  estado.rascunho = dados.rascunho;
  estado.trabalho = { ...conteudoVazio(), ...copiar(dados.rascunho.conteudo) };
  limparCache('rascunho');
  notificar();
}

export async function restaurarVersao(id) {
  const dados = await api('/restaurar', { metodo: 'POST', corpo: { id } });
  estado.rascunho = dados.rascunho;
  estado.trabalho = { ...conteudoVazio(), ...copiar(dados.rascunho.conteudo) };
  limparCache('rascunho');
  notificar();
}

// ——— Edições na cópia de trabalho ———

export function textoAtual(original) {
  const novo = estado.trabalho.textos[original];
  return novo === undefined ? original : novo;
}

export function definirTexto(original, novo) {
  const limpo = normalizar(novo);
  if (limpo === original) delete estado.trabalho.textos[original];
  else estado.trabalho.textos[original] = limpo;
  notificar();
}

export function definirSeo(caminho, campo, valor, original) {
  const limpo = normalizar(valor);
  const item = { ...(estado.trabalho.seo[caminho] || {}) };
  if (!limpo || limpo === normalizar(original)) delete item[campo];
  else item[campo] = limpo;
  if (Object.keys(item).length) estado.trabalho.seo[caminho] = item;
  else delete estado.trabalho.seo[caminho];
  notificar();
}

export function definirFaq(caminho, itens, originais) {
  const iguais = JSON.stringify(itens) === JSON.stringify(originais);
  if (!itens || iguais) delete estado.trabalho.faq[caminho];
  else estado.trabalho.faq[caminho] = itens;
  notificar();
}

export function definirLlms(texto, original) {
  const limpo = (texto || '').replace(/\r\n/g, '\n').trim();
  estado.trabalho.llms = !limpo || limpo === (original || '').trim() ? null : `${limpo}\n`;
  notificar();
}

export function definirPerfis(lista) {
  estado.trabalho.perfis = lista;
  notificar();
}

export function definirProjetos(projetos) {
  estado.trabalho.projetos = projetos && projetos.itens.length ? projetos : null;
  notificar();
}

export function definirRedirecionamentos(lista) {
  estado.trabalho.redirecionamentos = lista;
  notificar();
}

export function substituirTrabalho(conteudo) {
  estado.trabalho = { ...conteudoVazio(), ...copiar(conteudo) };
  notificar();
}
