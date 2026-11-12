// Ponto de entrada do Worker da KAS-Trom na Cloudflare. Decide quem atende cada pedido:
//
//   /api/cms/...   → a API do painel (worker/cms/api.js)
//   /admin/...     → os arquivos do painel (pasta admin/), sempre sem cache e fora dos buscadores
//   /midia/...     → vídeos e capas enviados pelo painel (worker/cms/midia.js)
//   *.mp4          → os vídeos, com suporte a "pular para um ponto" (worker/video.js)
//   todo o resto   → o site, com as edições do painel aplicadas (worker/cms/site.js)
//
// Se o CMS não estiver configurado, ou se algo der errado nele, o site é entregue como sempre foi.

import { api } from './cms/api.js';
import { sessaoValida } from './cms/sessao.js';
import { servirSite } from './cms/site.js';
import { servirVideo } from './video.js';
import { servirMidia } from './cms/midia.js';

async function servirPainel(request, env) {
  const resposta = await env.ASSETS.fetch(request);
  const cabecalhos = new Headers(resposta.headers);
  cabecalhos.set('Cache-Control', 'no-cache');
  cabecalhos.set('X-Robots-Tag', 'noindex, nofollow');
  // Só no painel: permite abrir, na própria aba, o vídeo que a pessoa escolheu no computador (endereço "blob:"),
  // para tirar dele a imagem de capa antes do envio. O resto do site continua com a regra original.
  const csp = cabecalhos.get('Content-Security-Policy');
  if (csp && !/media-src/i.test(csp)) cabecalhos.set('Content-Security-Policy', `${csp}; media-src 'self' blob:`);
  return new Response(resposta.body, { status: resposta.status, headers: cabecalhos });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const caminho = url.pathname;

    if (caminho === '/api/cms' || caminho.startsWith('/api/cms/')) {
      try {
        return await api(request, env);
      } catch (erro) {
        console.error('CMS: erro na API.', erro);
        return new Response(JSON.stringify({ erro: 'Erro interno. Tente de novo em instantes.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
        });
      }
    }

    if (caminho === '/admin' || caminho.startsWith('/admin/')) return servirPainel(request, env);
    if (caminho.startsWith('/midia/')) return servirMidia(request, env);
    if (caminho.toLowerCase().endsWith('.mp4')) return servirVideo(request, env);

    // Sem o KV ligado não há edições a aplicar: o site segue direto, como antes do CMS.
    if (!env.CMS) return env.ASSETS.fetch(request);

    let logado = false;
    if (url.searchParams.has('cms')) {
      try { logado = await sessaoValida(request, env); } catch { logado = false; }
    }
    try {
      return await servirSite(request, env, logado);
    } catch (erro) {
      console.error('CMS: erro ao servir o site; entregando o original.', erro);
      return env.ASSETS.fetch(request);
    }
  },
};
