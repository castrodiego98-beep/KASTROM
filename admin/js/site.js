// Lê as páginas do site (pelo próprio navegador) e descobre o que pode ser editado e auditado.
//
// "modo" diz qual versão da página buscar:
//   original  → o arquivo como o site foi construído, sem nenhuma edição do painel
//   rascunho  → com as edições salvas no rascunho
//   publicado → exatamente o que um visitante vê

import { normalizar, chavePagina, SELETOR_FAQ } from './comum.js';

const FORA_DO_TEXTO = 'script,style,noscript,template';
export const ATRIBUTOS_DE_TEXTO = ['alt', 'aria-label', 'placeholder', 'title'];
const NOME_DO_ATRIBUTO = {
  alt: 'Descrição da imagem (texto alternativo)',
  'aria-label': 'Rótulo para leitores de tela',
  placeholder: 'Texto de exemplo do campo',
  title: 'Dica ao passar o mouse',
};

const cache = new Map();
export function limparCache(modo) {
  for (const chave of [...cache.keys()]) if (!modo || chave.startsWith(`${modo}:`)) cache.delete(chave);
}

function regiaoDe(elemento) {
  if (elemento.closest('main')) return 'conteudo';
  if (elemento.closest('footer')) return 'rodape';
  return 'cabecalho'; // cabeçalho, menu e o link "pular para o conteúdo"
}

function tipoDe(elemento) {
  if (elemento.closest('.sr-only')) return 'Texto para leitores de tela';
  if (elemento.closest('svg')) return 'Texto da ilustração';
  if (elemento.closest('button')) return 'Botão';
  const link = elemento.closest('a');
  if (link) {
    const bloco = link.closest('p,li,dd,figcaption,label');
    return bloco && normalizar(bloco.textContent).length > normalizar(link.textContent).length ? 'Link dentro do texto' : 'Link ou botão';
  }
  const bloco = elemento.closest('h1,h2,h3,h4,h5,h6,summary,p,li,dt,dd,figcaption,label,legend,option,th,td');
  const nomes = {
    H1: 'Título principal (H1)', H2: 'Título de seção (H2)', H3: 'Subtítulo (H3)', H4: 'Subtítulo', H5: 'Subtítulo', H6: 'Subtítulo',
    SUMMARY: 'Título de sanfona', P: 'Parágrafo', LI: 'Item de lista', DT: 'Rótulo', DD: 'Valor', FIGCAPTION: 'Legenda',
    LABEL: 'Rótulo de campo', LEGEND: 'Título do grupo de campos', OPTION: 'Opção da lista', TH: 'Célula de tabela', TD: 'Célula de tabela',
  };
  return (bloco && nomes[bloco.tagName]) || 'Texto';
}

/** Passa por todos os textos visíveis de um documento, na ordem em que aparecem. */
export function* textosDoDocumento(doc) {
  if (!doc.body) return;
  const andador = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let no;
  while ((no = andador.nextNode())) {
    const pai = no.parentElement;
    if (!pai || pai.closest(FORA_DO_TEXTO) || pai.closest(SELETOR_FAQ)) continue;
    const original = normalizar(no.nodeValue);
    if (!original) continue;
    yield { no, original, elemento: pai };
  }
}

/** Passa pelos atributos que são texto (alt de imagem, rótulos etc.). */
export function* atributosDoDocumento(doc) {
  if (!doc.body) return;
  for (const elemento of doc.body.querySelectorAll(ATRIBUTOS_DE_TEXTO.map((a) => `[${a}]`).join(','))) {
    if (elemento.closest(FORA_DO_TEXTO) || elemento.closest(SELETOR_FAQ)) continue;
    for (const atributo of ATRIBUTOS_DE_TEXTO) {
      const original = normalizar(elemento.getAttribute(atributo));
      if (original) yield { elemento, atributo, original };
    }
  }
}

/** Texto de um elemento como se lê na tela: uma quebra de linha (<br>) conta como espaço. */
export function textoVisivel(elemento) {
  if (!elemento) return '';
  const copia = elemento.cloneNode(true);
  for (const quebra of copia.querySelectorAll('br')) quebra.replaceWith(' ');
  return normalizar(copia.textContent);
}

function soSimbolos(texto) {
  return !/[\p{L}\p{N}]/u.test(texto);
}

/** Lista os campos editáveis de uma página, agrupados por região e seção. */
export function camposEditaveis(doc) {
  const campos = new Map();
  let secao = 'Topo da página';
  for (const { original, elemento } of textosDoDocumento(doc)) {
    const regiao = regiaoDe(elemento);
    if (regiao === 'conteudo') {
      const titulo = elemento.closest('h1,h2');
      if (titulo) secao = textoVisivel(titulo).slice(0, 80);
    }
    if (soSimbolos(original)) continue;
    const existente = campos.get(original);
    if (existente) { existente.vezes++; continue; }
    campos.set(original, { original, tipo: tipoDe(elemento), regiao, secao: regiao === 'conteudo' ? secao : '', vezes: 1, atributo: null });
  }
  for (const { elemento, atributo, original } of atributosDoDocumento(doc)) {
    if (soSimbolos(original)) continue;
    const existente = campos.get(original);
    if (existente) { existente.vezes++; continue; }
    campos.set(original, { original, tipo: NOME_DO_ATRIBUTO[atributo], regiao: regiaoDe(elemento), secao: 'Imagens e rótulos', vezes: 1, atributo });
  }
  return [...campos.values()];
}

/** Lê as perguntas frequentes da página (ou null se a página não tem esse bloco). */
export function faqDoDocumento(doc) {
  const blocos = [...doc.querySelectorAll(SELETOR_FAQ)];
  if (!blocos.length) return null;
  return blocos.map((bloco) => {
    const resumo = bloco.querySelector(':scope > summary');
    const paragrafos = [...bloco.querySelectorAll(':scope > p')].map((p) => normalizar(p.textContent)).filter(Boolean);
    return { pergunta: normalizar(resumo?.textContent), resposta: paragrafos.join('\n\n') };
  });
}

function dadosEstruturados(doc) {
  const nos = [];
  const erros = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((script, i) => {
    try {
      const dados = JSON.parse(script.textContent);
      const lista = Array.isArray(dados) ? dados : dados['@graph'] ? dados['@graph'] : [dados];
      nos.push(...lista.filter((n) => n && typeof n === 'object'));
    } catch (erro) {
      erros.push(`Bloco ${i + 1}: ${erro.message}`);
    }
  });
  return { nos, erros };
}

export function tiposDe(no) {
  const t = no?.['@type'];
  return Array.isArray(t) ? t : t ? [t] : [];
}

const meta = (doc, seletor) => doc.querySelector(seletor)?.getAttribute('content')?.trim() || '';

export async function analisarPagina(caminho, modo = 'publicado') {
  const chave = `${modo}:${caminho}`;
  if (cache.has(chave)) return cache.get(chave);
  const promessa = (async () => {
    const endereco = modo === 'publicado' ? caminho : `${caminho}${caminho.includes('?') ? '&' : '?'}cms=${modo}`;
    const resposta = await fetch(endereco, { cache: 'no-store', credentials: 'same-origin' });
    const html = await resposta.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const principal = doc.querySelector('main') || doc.body;
    const ld = dadosEstruturados(doc);
    const fimDoHtml = html.toLowerCase().lastIndexOf('</html>');
    return {
      caminho,
      modo,
      status: resposta.status,
      cabecalhos: Object.fromEntries([...resposta.headers].map(([k, v]) => [k.toLowerCase(), v])),
      html,
      doc,
      bytes: new TextEncoder().encode(html).length,
      idioma: doc.documentElement.getAttribute('lang') || '',
      titulo: normalizar(doc.querySelector('head title')?.textContent),
      descricao: meta(doc, 'meta[name="description"]'),
      canonica: doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
      robots: meta(doc, 'meta[name="robots"]'),
      og: {
        titulo: meta(doc, 'meta[property="og:title"]'),
        descricao: meta(doc, 'meta[property="og:description"]'),
        imagem: meta(doc, 'meta[property="og:image"]'),
      },
      jsonld: ld.nos,
      jsonldErros: ld.erros,
      titulos: [...doc.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((t) => ({ nivel: Number(t.tagName[1]), texto: textoVisivel(t) })),
      faq: faqDoDocumento(doc),
      palavras: textoVisivel(principal).split(' ').filter(Boolean).length,
      sobraAposHtml: fimDoHtml >= 0 ? html.slice(fimDoHtml + 7).trim().length : 0,
    };
  })();
  cache.set(chave, promessa);
  promessa.catch(() => cache.delete(chave));
  return promessa;
}

async function enderecosDoSitemap(endereco, profundidade = 0) {
  const resposta = await fetch(endereco, { cache: 'no-store' });
  if (!resposta.ok) return [];
  const xml = new DOMParser().parseFromString(await resposta.text(), 'application/xml');
  if (xml.querySelector('parsererror')) return [];
  const filhos = [...xml.querySelectorAll('sitemap > loc')].map((l) => l.textContent.trim());
  if (filhos.length && profundidade < 2) {
    const listas = await Promise.all(filhos.map((f) => {
      try { return enderecosDoSitemap(new URL(f).pathname, profundidade + 1); } catch { return []; }
    }));
    return listas.flat();
  }
  return [...xml.querySelectorAll('url > loc')].map((l) => l.textContent.trim());
}

let promessaDePaginas = null;
/** Descobre as páginas do site: primeiro pelo sitemap; se não houver, pelos links da página inicial. */
export function descobrirPaginas() {
  if (promessaDePaginas) return promessaDePaginas;
  promessaDePaginas = (async () => {
    let enderecos = [];
    let fonte = 'sitemap';
    for (const tentativa of ['/sitemap-index.xml', '/sitemap.xml']) {
      try { enderecos = await enderecosDoSitemap(tentativa); } catch { enderecos = []; }
      if (enderecos.length) break;
    }
    const caminhos = new Set(['/']);
    for (const e of enderecos) {
      try { caminhos.add(chavePagina(new URL(e, location.origin).pathname)); } catch { /* endereço inválido */ }
    }
    if (caminhos.size === 1) {
      fonte = 'links';
      const inicio = await analisarPagina('/', 'original');
      for (const link of inicio.doc.querySelectorAll('a[href^="/"]')) {
        const caminho = chavePagina(link.getAttribute('href'));
        if (!/\.[a-z0-9]{2,5}$/i.test(caminho) && !caminho.startsWith('/admin')) caminhos.add(caminho);
      }
    }
    return { caminhos: [...caminhos], fonte, noSitemap: enderecos };
  })();
  promessaDePaginas.catch(() => { promessaDePaginas = null; });
  return promessaDePaginas;
}

export async function buscarTexto(caminho) {
  try {
    const resposta = await fetch(caminho, { cache: 'no-store', credentials: 'same-origin' });
    return { status: resposta.status, texto: resposta.ok ? await resposta.text() : '', tipo: resposta.headers.get('content-type') || '' };
  } catch {
    return { status: 0, texto: '', tipo: '' };
  }
}

/** Todos os textos originais que existem no site (para saber se uma edição ainda encontra o texto de origem). */
export async function textosOriginaisDoSite() {
  const { caminhos } = await descobrirPaginas();
  const analises = await Promise.all(caminhos.map((c) => analisarPagina(c, 'original').catch(() => null)));
  const todos = new Set();
  for (const analise of analises) {
    if (!analise) continue;
    for (const { original } of textosDoDocumento(analise.doc)) todos.add(original);
    for (const { original } of atributosDoDocumento(analise.doc)) todos.add(original);
    for (const no of analise.jsonld) JSON.stringify(no, (_, v) => { if (typeof v === 'string') todos.add(normalizar(v)); return v; });
  }
  return todos;
}
