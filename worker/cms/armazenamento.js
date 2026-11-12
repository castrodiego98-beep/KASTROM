// Onde o conteúdo fica guardado: o Workers KV da Cloudflare (ligação "CMS").
//
//   publicado      → o que os visitantes veem
//   rascunho       → o que está sendo editado no painel (só aparece na prévia)
//   versoes        → lista das publicações anteriores (para o histórico)
//   versao:<id>    → o conteúdo de cada publicação anterior

import { conteudoVazio } from '../../admin/js/comum.js';

const MAX_VERSOES = 30;
const VALIDADE_MEMORIA_MS = 10000;

// Guarda o "publicado" por alguns segundos na memória para não consultar o KV a cada visita.
let memoria = { ate: 0, documento: null };

function documentoVazio() {
  return { rev: 0, em: null, conteudo: conteudoVazio() };
}

function arrumar(documento) {
  if (!documento || typeof documento !== 'object') return documentoVazio();
  return {
    rev: Number(documento.rev) || 0,
    em: documento.em || null,
    por: documento.por || undefined,
    conteudo: { ...conteudoVazio(), ...(documento.conteudo || {}) },
  };
}

export async function lerPublicado(env, { semMemoria = false } = {}) {
  if (!env.CMS) return documentoVazio();
  const agora = Date.now();
  if (!semMemoria && memoria.documento && memoria.ate > agora) return memoria.documento;
  const documento = arrumar(await env.CMS.get('publicado', 'json'));
  memoria = { ate: agora + VALIDADE_MEMORIA_MS, documento };
  return documento;
}

export async function lerRascunho(env) {
  const guardado = await env.CMS.get('rascunho', 'json');
  if (guardado) return arrumar(guardado);
  // Sem rascunho próprio, o rascunho é igual ao que está publicado.
  const publicado = await lerPublicado(env, { semMemoria: true });
  return { rev: publicado.rev, em: publicado.em, conteudo: publicado.conteudo };
}

export async function gravarRascunho(env, conteudo, revAnterior) {
  const documento = { rev: revAnterior + 1, em: new Date().toISOString(), conteudo };
  await env.CMS.put('rascunho', JSON.stringify(documento));
  return documento;
}

export async function lerVersoes(env) {
  const lista = await env.CMS.get('versoes', 'json');
  return Array.isArray(lista) ? lista : [];
}

export async function lerVersao(env, id) {
  if (!/^[0-9a-z-]{8,40}$/i.test(String(id))) return null;
  const guardado = await env.CMS.get(`versao:${id}`, 'json');
  return guardado ? arrumar(guardado) : null;
}

export async function publicar(env, nota, resumo) {
  const rascunho = await lerRascunho(env);
  const agora = new Date();
  const documento = { rev: rascunho.rev, em: agora.toISOString(), conteudo: rascunho.conteudo };
  const id = `${agora.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  await env.CMS.put(`versao:${id}`, JSON.stringify(documento));
  await env.CMS.put('publicado', JSON.stringify(documento));
  memoria = { ate: Date.now() + VALIDADE_MEMORIA_MS, documento: arrumar(documento) };

  const versoes = await lerVersoes(env);
  versoes.unshift({ id, em: documento.em, nota: String(nota || '').slice(0, 200), resumo });
  const sobras = versoes.splice(MAX_VERSOES);
  await env.CMS.put('versoes', JSON.stringify(versoes));
  await Promise.all(sobras.map((v) => env.CMS.delete(`versao:${v.id}`)));

  return { documento, id };
}
