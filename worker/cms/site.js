// Entrega das páginas do site, com as edições do painel aplicadas quando existem.

import { chavePagina } from '../../admin/js/comum.js';
import { lerPublicado, lerRascunho } from './armazenamento.js';
import { aplicarCamada, aprenderModeloFaq, precisaDeCamada } from './camada.js';

function ehHtml(resposta) {
  return (resposta.headers.get('Content-Type') || '').toLowerCase().includes('text/html');
}

// A prévia do painel abre a página dentro de uma moldura (iframe) do próprio site. Só nesse caso, e só para
// quem está logado, afrouxamos a regra que proíbe o site de ser exibido dentro de molduras.
function liberarParaPrevia(resposta) {
  const cabecalhos = new Headers(resposta.headers);
  cabecalhos.delete('X-Frame-Options');
  const csp = cabecalhos.get('Content-Security-Policy');
  if (csp) cabecalhos.set('Content-Security-Policy', csp.replace(/frame-ancestors[^;]*/i, "frame-ancestors 'self'"));
  cabecalhos.set('Cache-Control', 'no-store');
  cabecalhos.set('X-Robots-Tag', 'noindex, nofollow');
  cabecalhos.delete('ETag');
  cabecalhos.delete('Last-Modified');
  return new Response(resposta.body, { status: resposta.status, headers: cabecalhos });
}

function semCondicionais(request) {
  const cabecalhos = new Headers(request.headers);
  cabecalhos.delete('If-None-Match');
  cabecalhos.delete('If-Modified-Since');
  return new Request(request.url, { method: 'GET', headers: cabecalhos });
}

export async function servirSite(request, env, logado) {
  if (request.method !== 'GET') return env.ASSETS.fetch(request);

  const url = new URL(request.url);
  const caminho = chavePagina(url.pathname);
  // "?cms=original" e "?cms=rascunho" só valem para quem está logado no painel.
  const pedidoDePrevia = url.searchParams.get('cms');
  const modo = logado && (pedidoDePrevia === 'original' || pedidoDePrevia === 'rascunho') ? pedidoDePrevia : null;

  if (modo === 'original') return liberarParaPrevia(await env.ASSETS.fetch(semCondicionais(request)));

  let conteudo;
  try {
    conteudo = (modo === 'rascunho' ? await lerRascunho(env) : await lerPublicado(env)).conteudo;
  } catch (erro) {
    console.error('CMS: não foi possível ler o conteúdo; entregando o site original.', erro);
    return env.ASSETS.fetch(request);
  }

  if (!modo) {
    const destino = (conteudo.redirecionamentos || []).find((r) => r.de === caminho);
    if (destino) return Response.redirect(new URL(destino.para, url.origin).toString(), destino.codigo);
  }

  if (caminho === '/llms.txt' && conteudo.llms) {
    const original = await env.ASSETS.fetch(semCondicionais(request));
    const cabecalhos = new Headers(original.status === 200 ? original.headers : {});
    cabecalhos.set('Content-Type', 'text/plain; charset=utf-8');
    cabecalhos.delete('ETag');
    cabecalhos.delete('Last-Modified');
    cabecalhos.delete('Content-Length');
    if (!cabecalhos.has('Cache-Control') || modo) cabecalhos.set('Cache-Control', modo ? 'no-store' : 'public, max-age=0, must-revalidate');
    return new Response(conteudo.llms, { status: 200, headers: cabecalhos });
  }

  if (!precisaDeCamada(conteudo, caminho)) {
    return modo ? liberarParaPrevia(await env.ASSETS.fetch(semCondicionais(request))) : env.ASSETS.fetch(request);
  }

  const pedido = semCondicionais(request);
  const original = await env.ASSETS.fetch(pedido);
  if (!ehHtml(original) || !original.body) return original;

  try {
    let modeloFaq = null;
    if (conteudo.faq?.[caminho]) modeloFaq = await aprenderModeloFaq(original.clone());
    const editada = aplicarCamada(original, conteudo, caminho, modeloFaq);
    return modo ? liberarParaPrevia(editada) : editada;
  } catch (erro) {
    console.error('CMS: erro ao aplicar as edições; entregando a página original.', erro);
    return env.ASSETS.fetch(request);
  }
}
