// API do painel: tudo o que o painel faz passa por estes endereços, sempre em /api/cms/.

import { validarConteudo, diferencas, textosAConfirmar, LIMITES, MARCA_A_CONFIRMAR } from '../../admin/js/comum.js';
import { entrar, sessaoValida, oQueFalta, cookieDeSaida } from './sessao.js';
import { lerPublicado, lerRascunho, gravarRascunho, lerVersoes, lerVersao, publicar } from './armazenamento.js';
import { listarMidia, guardarMidia, apagarMidia } from './midia.js';

const TAMANHO_MAXIMO = 600000;

function json(dados, status = 200, cabecalhos = {}) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      ...cabecalhos,
    },
  });
}

async function lerCorpo(request) {
  const texto = await request.text();
  if (texto.length > TAMANHO_MAXIMO) throw new Error('grande');
  return texto ? JSON.parse(texto) : {};
}

export async function api(request, env) {
  const url = new URL(request.url);
  const rota = url.pathname.replace(/^\/api\/cms/, '').replace(/\/+$/, '') || '/';
  const metodo = request.method;
  const falta = oQueFalta(env);

  if (rota === '/sessao' && metodo === 'GET') {
    return json({ configurado: falta.length === 0, faltando: falta, autenticado: await sessaoValida(request, env) });
  }
  if (falta.length) return json({ erro: 'O painel ainda não foi configurado na Cloudflare.', faltando: falta }, 503);

  // Envio de arquivo para a biblioteca de mídia: o corpo é o próprio arquivo, não JSON.
  if (rota === '/midia' && metodo === 'POST') {
    if (request.headers.get('Origin') !== url.origin) return json({ erro: 'Origem não permitida.' }, 403);
    if (!(await sessaoValida(request, env))) return json({ erro: 'Sua sessão terminou. Entre de novo.' }, 401);
    if (Number(request.headers.get('Content-Length') || 0) > LIMITES.midiaBytes) return json({ erro: `O arquivo passa do limite de ${LIMITES.midiaBytes / 1048576} MB.` }, 413);
    const resultado = await guardarMidia(env, await request.arrayBuffer(), url.searchParams.get('nome'));
    return resultado.ok ? json({ arquivo: resultado.arquivo }) : json({ erro: resultado.erro }, resultado.status);
  }

  let corpo = {};
  if (metodo !== 'GET') {
    // Só aceita pedidos feitos pelo próprio painel (mesma origem) e em JSON: barra envios forjados por outros sites.
    if (request.headers.get('Origin') !== url.origin) return json({ erro: 'Origem não permitida.' }, 403);
    if (metodo !== 'DELETE') {
      if (!(request.headers.get('Content-Type') || '').includes('application/json')) return json({ erro: 'Envie os dados em JSON.' }, 415);
      try { corpo = await lerCorpo(request); } catch { return json({ erro: 'Não foi possível ler os dados enviados.' }, 400); }
    }
  }

  if (rota === '/entrar' && metodo === 'POST') {
    const resultado = await entrar(request, env, corpo?.senha);
    if (!resultado.ok) return json({ erro: resultado.erro }, resultado.status);
    return json({ autenticado: true }, 200, { 'Set-Cookie': resultado.cookie });
  }
  if (rota === '/sair' && metodo === 'POST') {
    return json({ autenticado: false }, 200, { 'Set-Cookie': cookieDeSaida(url) });
  }

  if (!(await sessaoValida(request, env))) return json({ erro: 'Sua sessão terminou. Entre de novo.' }, 401);

  if (rota === '/conteudo' && metodo === 'GET') {
    const [rascunho, publicado] = await Promise.all([lerRascunho(env), lerPublicado(env, { semMemoria: true })]);
    return json({ rascunho, publicado });
  }

  if (rota === '/rascunho' && metodo === 'PUT') {
    const conferido = validarConteudo(corpo?.conteudo);
    if (!conferido.ok) return json({ erro: 'Há itens a corrigir antes de salvar.', erros: conferido.erros }, 422);
    const atual = await lerRascunho(env);
    if (Number(corpo?.rev) !== atual.rev) {
      return json({ erro: 'O rascunho foi alterado em outra aba ou por outra pessoa. Recarregue antes de salvar.', rascunho: atual }, 409);
    }
    return json({ rascunho: await gravarRascunho(env, conferido.conteudo, atual.rev) });
  }

  if (rota === '/publicar' && metodo === 'POST') {
    const [rascunho, publicado] = await Promise.all([lerRascunho(env), lerPublicado(env, { semMemoria: true })]);
    const conferido = validarConteudo(rascunho.conteudo);
    if (!conferido.ok) return json({ erro: 'O rascunho tem itens a corrigir.', erros: conferido.erros }, 422);
    const aConfirmar = textosAConfirmar(rascunho.conteudo);
    if (aConfirmar) return json({ erro: `Há ${aConfirmar} texto(s) com a marca ${MARCA_A_CONFIRMAR}. Revise, apague a marca e salve antes de publicar.` }, 422);
    const mudancas = diferencas(publicado.conteudo, rascunho.conteudo).length;
    if (!mudancas) return json({ erro: 'Não há alterações para publicar.' }, 409);
    const resultado = await publicar(env, corpo?.nota, `${mudancas} ${mudancas === 1 ? 'alteração' : 'alterações'}`);
    return json({ publicado: resultado.documento, id: resultado.id });
  }

  if (rota === '/descartar' && metodo === 'POST') {
    const [rascunho, publicado] = await Promise.all([lerRascunho(env), lerPublicado(env, { semMemoria: true })]);
    return json({ rascunho: await gravarRascunho(env, publicado.conteudo, rascunho.rev) });
  }

  if (rota === '/midia' && metodo === 'GET') return json({ arquivos: await listarMidia(env), limiteBytes: LIMITES.midiaBytes });

  const midia = /^\/midia\/([0-9a-f]{24})$/.exec(rota);
  if (midia && metodo === 'DELETE') {
    const endereco = `/midia/${midia[1]}`;
    const [rascunho, publicado] = await Promise.all([lerRascunho(env), lerPublicado(env, { semMemoria: true })]);
    const emUso = [rascunho, publicado].some((d) => (d.conteudo.projetos?.itens || []).some((i) => i.video === endereco || i.capa === endereco));
    if (emUso) return json({ erro: 'Este arquivo está em uso em um projeto (no rascunho ou no site). Tire-o do projeto e publique antes de apagar.' }, 409);
    return (await apagarMidia(env, midia[1])) ? json({ apagado: true }) : json({ erro: 'Arquivo não encontrado.' }, 404);
  }

  if (rota === '/versoes' && metodo === 'GET') return json({ versoes: await lerVersoes(env) });

  const versao = /^\/versoes\/([0-9a-z-]+)$/i.exec(rota);
  if (versao && metodo === 'GET') {
    const documento = await lerVersao(env, versao[1]);
    return documento ? json({ versao: documento }) : json({ erro: 'Versão não encontrada.' }, 404);
  }

  if (rota === '/restaurar' && metodo === 'POST') {
    const documento = await lerVersao(env, corpo?.id);
    if (!documento) return json({ erro: 'Versão não encontrada.' }, 404);
    const conferido = validarConteudo(documento.conteudo);
    const rascunho = await lerRascunho(env);
    return json({ rascunho: await gravarRascunho(env, conferido.conteudo, rascunho.rev) });
  }

  return json({ erro: 'Endereço não encontrado.' }, 404);
}
