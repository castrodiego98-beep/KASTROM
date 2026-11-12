// Biblioteca de mídia do painel: os vídeos curtos e as capas da seção "outros projetos".
//
// Os arquivos ficam no mesmo KV do conteúdo (ligação "CMS"), cada um com até 10 MB, e são entregues em
// /midia/<código>. O código é a "impressão digital" do arquivo (SHA-256): o mesmo arquivo enviado duas vezes
// ocupa um lugar só, e o endereço nunca muda de conteúdo, por isso pode ficar em cache por um ano.
//
// Se a biblioteca crescer (muitos vídeos ou arquivos maiores), o destino certo é o Cloudflare R2.

import { LIMITES, TIPOS_DE_MIDIA } from '../../admin/js/comum.js';
import { lerIntervalo } from '../video.js';

const CHAVE_VALIDA = /^[0-9a-f]{24}$/;

/** Confere, pelos primeiros bytes, se o arquivo é mesmo do tipo que diz ser. */
export function tipoReal(bytes) {
  const b = bytes;
  const texto = (inicio, fim) => String.fromCharCode(...b.slice(inicio, fim));
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && texto(1, 4) === 'PNG') return 'image/png';
  if (texto(0, 4) === 'RIFF' && texto(8, 12) === 'WEBP') return 'image/webp';
  if (texto(4, 8) === 'ftyp') return 'video/mp4';
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'video/webm';
  return null;
}

async function lerIndice(env) {
  const lista = await env.CMS.get('midia:indice', 'json');
  return Array.isArray(lista) ? lista : [];
}

export async function listarMidia(env) {
  return lerIndice(env);
}

/** Guarda um arquivo enviado pelo painel. Devolve { ok, status, erro?, arquivo? }. */
export async function guardarMidia(env, dados, nome) {
  const bytes = new Uint8Array(dados);
  if (bytes.length === 0) return { ok: false, status: 400, erro: 'O arquivo está vazio.' };
  if (bytes.length > LIMITES.midiaBytes) {
    return { ok: false, status: 413, erro: `O arquivo tem ${(bytes.length / 1048576).toFixed(1)} MB; o limite é ${LIMITES.midiaBytes / 1048576} MB. Reduza o vídeo antes de enviar.` };
  }
  const tipo = tipoReal(bytes);
  if (!tipo || !TIPOS_DE_MIDIA[tipo]) return { ok: false, status: 415, erro: 'Tipo de arquivo não aceito. Envie vídeo MP4 ou WebM, ou imagem JPG, PNG ou WebP.' };

  const resumo = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const chave = [...resumo.slice(0, 12)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const arquivo = { chave, endereco: `/midia/${chave}`, tipo, bytes: bytes.length, nome: String(nome || '').slice(0, 120), em: new Date().toISOString() };

  const indice = await lerIndice(env);
  if (!indice.some((a) => a.chave === chave)) {
    await env.CMS.put(`midia:${chave}`, bytes, { metadata: { tipo, bytes: bytes.length } });
    indice.unshift(arquivo);
    await env.CMS.put('midia:indice', JSON.stringify(indice));
  }
  return { ok: true, status: 200, arquivo: indice.find((a) => a.chave === chave) || arquivo };
}

export async function apagarMidia(env, chave) {
  if (!CHAVE_VALIDA.test(chave)) return false;
  const indice = await lerIndice(env);
  if (!indice.some((a) => a.chave === chave)) return false;
  await env.CMS.delete(`midia:${chave}`);
  await env.CMS.put('midia:indice', JSON.stringify(indice.filter((a) => a.chave !== chave)));
  return true;
}

/** Entrega pública de /midia/<código>, com suporte a pedido de trecho (para o vídeo poder ser avançado). */
export async function servirMidia(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const chave = new URL(request.url).pathname.slice('/midia/'.length);
  if (!CHAVE_VALIDA.test(chave) || !env.CMS) return new Response('Arquivo não encontrado.', { status: 404 });

  const { value: dados, metadata } = await env.CMS.getWithMetadata(`midia:${chave}`, { type: 'arrayBuffer', cacheTtl: 3600 });
  if (!dados || !TIPOS_DE_MIDIA[metadata?.tipo]) return new Response('Arquivo não encontrado.', { status: 404 });

  const total = dados.byteLength;
  const cabecalhos = new Headers({
    'Content-Type': metadata.tipo,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Accept-Ranges': 'bytes',
    ETag: `"${chave}"`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  if (request.headers.get('If-None-Match') === `"${chave}"`) return new Response(null, { status: 304, headers: cabecalhos });

  const semCorpo = request.method === 'HEAD';
  const pedido = request.headers.get('Range');
  const intervalo = pedido ? lerIntervalo(pedido, total) : 'ignorar';
  if (intervalo === 'impossivel') {
    cabecalhos.set('Content-Range', `bytes */${total}`);
    return new Response(null, { status: 416, headers: cabecalhos });
  }
  if (intervalo === 'ignorar') {
    cabecalhos.set('Content-Length', String(total));
    return new Response(semCorpo ? null : dados, { status: 200, headers: cabecalhos });
  }
  cabecalhos.set('Content-Range', `bytes ${intervalo.inicio}-${intervalo.fim}/${total}`);
  cabecalhos.set('Content-Length', String(intervalo.fim - intervalo.inicio + 1));
  return new Response(semCorpo ? null : dados.slice(intervalo.inicio, intervalo.fim + 1), { status: 206, headers: cabecalhos });
}
