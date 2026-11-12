// A "camada de edição": aplica, na hora da entrega, o que foi editado no painel sobre o HTML pronto do site.
//
// O site continua sendo o que o Astro gerou. Este código só troca, enquanto a página passa pela Cloudflare:
//   - textos (acha o texto original na página e escreve o novo no lugar);
//   - título e descrição da página (o que aparece no Google e ao compartilhar o link);
//   - as perguntas frequentes (na página e nos dados estruturados);
//   - os dados estruturados (JSON-LD), para ficarem iguais ao que o visitante lê.
//
// Se nada foi editado, a página é entregue exatamente como está, sem passar por aqui.

import { normalizar, decodificarEntidades, escaparHtml, SELETOR_FAQ, PAGINA_DOS_PROJETOS, ID_DOS_PROJETOS } from '../../admin/js/comum.js';

const ATRIBUTOS_DE_TEXTO = ['alt', 'aria-label', 'placeholder', 'title'];
const CHAVES_FIXAS = new Set(['@id', '@type', '@context', 'url', 'contentUrl', 'thumbnailUrl', 'email', 'taxID']); // nunca são trocadas
const modelosFaq = new Map(); // ETag do arquivo → formato das perguntas daquela página

export function precisaDeCamada(conteudo, caminho) {
  if (!conteudo) return false;
  return Boolean(
    Object.keys(conteudo.textos || {}).length || conteudo.seo?.[caminho] || conteudo.faq?.[caminho] || (conteudo.perfis || []).length ||
    (conteudo.projetos && caminho === PAGINA_DOS_PROJETOS),
  );
}

// O setAttribute da Cloudflare protege as aspas, mas não o "&": protegemos aqui para o valor sair correto.
function paraAtributo(valor) {
  return String(valor).replace(/&/g, '&amp;');
}

function atributos(lista, semOpen = false) {
  return (lista || [])
    .filter(([nome]) => !(semOpen && nome === 'open'))
    .map(([nome, valor]) => (valor === '' ? ` ${nome}` : ` ${nome}="${escaparHtml(decodificarEntidades(valor))}"`))
    .join('');
}

function mioloDaPergunta(item, modelo) {
  const icone = modelo.icone ? `<span${atributos(modelo.icone)}></span>` : '';
  const paragrafos = item.resposta.split('\n\n').map((p) => `<p${atributos(modelo.p)}>${escaparHtml(p)}</p>`).join('');
  return `<summary${atributos(modelo.summary)}>${escaparHtml(item.pergunta)}${icone}</summary>${paragrafos}`;
}

/** Lê a página uma vez só para aprender como as perguntas são montadas (classes e atributos de cada peça). */
export async function aprenderModeloFaq(resposta) {
  const etag = resposta.headers.get('ETag');
  if (etag && modelosFaq.has(etag)) return modelosFaq.get(etag);
  const modelo = { total: 0, details: null, summary: null, icone: null, p: null };
  await new HTMLRewriter()
    .on(SELETOR_FAQ, { element(e) { modelo.total++; if (!modelo.details) modelo.details = [...e.attributes]; } })
    .on(`${SELETOR_FAQ} > summary`, { element(e) { if (!modelo.summary) modelo.summary = [...e.attributes]; } })
    .on(`${SELETOR_FAQ} > summary > span`, { element(e) { if (!modelo.icone) modelo.icone = [...e.attributes]; } })
    .on(`${SELETOR_FAQ} > p`, { element(e) { if (!modelo.p) modelo.p = [...e.attributes]; } })
    .transform(resposta)
    .arrayBuffer();
  if (etag) {
    if (modelosFaq.size > 50) modelosFaq.clear();
    modelosFaq.set(etag, modelo);
  }
  return modelo;
}

// Aparência da seção "outros projetos". Usa as cores e as fontes do site (variáveis --color-*) e fica
// restrita a esta seção, para não interferir em mais nada da página.
const ESTILO_DOS_PROJETOS = `
.cms-projetos{background:var(--color-paper,#f5f2ea);border-top:1px solid var(--color-line,#cdc5b1);scroll-margin-top:5.25rem}
.cms-projetos-grade{display:grid;gap:2.5rem 2rem;margin-top:3rem;grid-template-columns:minmax(0,1fr)}
@media (min-width:40rem){.cms-projetos-grade{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:64rem){.cms-projetos-grade{grid-template-columns:repeat(3,minmax(0,1fr))}}
.cms-projeto{margin:0;display:flex;flex-direction:column}
.cms-projeto video,.cms-projeto img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;background:var(--color-ink,#0c1b2e);border:2px solid var(--color-ink,#0c1b2e)}
.cms-projeto figcaption{border-top:0;padding-top:.9rem}
.cms-projeto-meta{font-family:var(--font-mono,monospace);font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:var(--color-accent-ink,#9a4a08)}
.cms-projeto h3{font-size:1.25rem;line-height:1.25;margin-top:.3rem}
.cms-projeto p.cms-projeto-texto{margin-top:.5rem;color:var(--color-steel,#45586b);font-size:1rem}
.cms-projetos-nota{margin-top:2.5rem;border-left:4px solid var(--color-accent-ink,#9a4a08);padding-left:1rem;font-size:.875rem;color:var(--color-steel,#45586b)}
`.replace(/\n/g, '');

/** Monta o HTML da seção "outros projetos" a partir do que foi cadastrado no painel. */
export function htmlDosProjetos(projetos) {
  if (!projetos?.itens?.length) return '';
  const cartoes = projetos.itens.map((item) => {
    const rotulo = escaparHtml(`Animação em 3D: ${item.titulo}`);
    const midia = item.video
      ? `<video controls muted loop playsinline preload="none" poster="${escaparHtml(item.capa)}" src="${escaparHtml(item.video)}" aria-label="${rotulo}"></video>`
      : `<img src="${escaparHtml(item.capa)}" alt="${escaparHtml(item.titulo)}" width="1280" height="720" loading="lazy" decoding="async">`;
    const meta = [item.segmento, item.ano].filter(Boolean).map(escaparHtml).join(' · ');
    return `<figure class="cms-projeto">${midia}<figcaption>${meta ? `<p class="cms-projeto-meta">${meta}</p>` : ''}<h3>${escaparHtml(item.titulo)}</h3>${item.descricao ? `<p class="cms-projeto-texto">${escaparHtml(item.descricao)}</p>` : ''}</figcaption></figure>`;
  }).join('');
  const temVideo = projetos.itens.some((i) => i.video);
  return `<section class="cms-projetos" id="${ID_DOS_PROJETOS}"><style>${ESTILO_DOS_PROJETOS}</style><div class="wrap secao"><div class="max-w-3xl"><h2 class="titulo-secao">${escaparHtml(projetos.titulo)}</h2>${projetos.texto ? `<p class="mt-5 text-lg text-steel md:text-xl">${escaparHtml(projetos.texto)}</p>` : ''}</div><div class="cms-projetos-grade">${cartoes}</div>${temVideo ? '<p class="cms-projetos-nota">Os vídeos são animações em 3D dos projetos, sem som. Não são filmagens de campo.</p>' : ''}</div></section>`;
}

function tipos(no) {
  const t = no?.['@type'];
  return Array.isArray(t) ? t : t ? [t] : [];
}

/** Atualiza os dados estruturados (JSON-LD) com os mesmos textos que foram trocados na página. */
export function atualizarJsonLd(dados, { mapa, faq, perfis }) {
  const visitar = (valor) => {
    if (typeof valor === 'string') {
      const novo = mapa.get(normalizar(valor));
      return novo === undefined ? valor : novo;
    }
    if (Array.isArray(valor)) return valor.map(visitar);
    if (valor && typeof valor === 'object') {
      const saida = {};
      for (const [chave, v] of Object.entries(valor)) saida[chave] = CHAVES_FIXAS.has(chave) ? v : visitar(v);
      const t = tipos(saida);
      if (faq && t.includes('FAQPage')) {
        saida.mainEntity = faq.map((item) => ({
          '@type': 'Question',
          name: item.pergunta,
          acceptedAnswer: { '@type': 'Answer', text: item.resposta.replace(/\n\n/g, ' ') },
        }));
      }
      if (perfis?.length && t.includes('Organization')) saida.sameAs = perfis;
      return saida;
    }
    return valor;
  };
  return visitar(dados);
}

/** Devolve a mesma resposta com as edições aplicadas. */
export function aplicarCamada(resposta, conteudo, caminho, modeloFaq) {
  const mapa = new Map(Object.entries(conteudo.textos || {}));
  const seo = conteudo.seo?.[caminho] || {};
  const faq = modeloFaq?.total ? conteudo.faq?.[caminho] || null : null;
  const perfis = conteudo.perfis || [];

  const trocarTexto = (bruto) => {
    const decodificado = decodificarEntidades(bruto);
    const chave = normalizar(decodificado);
    if (!chave) return null;
    const novo = mapa.get(chave);
    if (novo === undefined) return null;
    // Mantém os espaços que havia antes e depois (por exemplo, o espaço antes de um link no meio da frase).
    return escaparHtml(/^\s*/.exec(decodificado)[0] + novo + /\s*$/.exec(decodificado)[0]);
  };

  // Junta os pedaços de um mesmo texto (a Cloudflare pode entregar um texto em várias partes).
  const juntar = (aoTerminar) => {
    let guardado = '';
    return (pedaco) => {
      if (!pedaco.lastInTextNode) { guardado += pedaco.text; pedaco.remove(); return; }
      const bruto = guardado + pedaco.text;
      guardado = '';
      if (!bruto) return;
      let novo = null;
      try { novo = aoTerminar(bruto); } catch (erro) { console.error('CMS: trecho mantido como estava.', erro); novo = null; }
      pedaco.replace(novo === null ? bruto : novo, { html: true });
    };
  };

  const mapaLd = new Map(mapa);
  let pular = 0; // dentro de <script>, <style> etc.: não é texto de página
  let dentroDaFaq = 0;
  let indiceFaq = 0;

  let leitor = new HTMLRewriter()
    .on('head title', {
      text: juntar((bruto) => {
        const original = normalizar(decodificarEntidades(bruto));
        if (!seo.titulo) return null;
        if (original) mapaLd.set(original, seo.titulo);
        return escaparHtml(seo.titulo);
      }),
    })
    .on('head meta', {
      element(e) {
        const nome = (e.getAttribute('name') || e.getAttribute('property') || '').toLowerCase();
        if (nome === 'description' && seo.descricao) {
          const original = normalizar(decodificarEntidades(e.getAttribute('content') || ''));
          if (original) mapaLd.set(original, seo.descricao);
          e.setAttribute('content', paraAtributo(seo.descricao));
        } else if ((nome === 'og:title' || nome === 'twitter:title') && seo.titulo) {
          e.setAttribute('content', paraAtributo(seo.titulo));
        } else if ((nome === 'og:description' || nome === 'twitter:description') && seo.descricao) {
          e.setAttribute('content', paraAtributo(seo.descricao));
        }
      },
    })
    .on('script[type="application/ld+json"]', {
      text: juntar((bruto) => {
        const dados = atualizarJsonLd(JSON.parse(bruto), { mapa: mapaLd, faq, perfis });
        return JSON.stringify(dados).replace(/</g, '\\u003c');
      }),
    })
    .on('body script, body style, body noscript, body template', {
      element(e) {
        pular++;
        try { e.onEndTag(() => { pular--; }); } catch { pular--; }
      },
    });

  if (faq) {
    leitor = leitor.on(SELETOR_FAQ, {
      element(e) {
        const i = indiceFaq++;
        if (i < faq.length) {
          dentroDaFaq++;
          try { e.onEndTag(() => { dentroDaFaq--; }); } catch { dentroDaFaq--; }
          e.removeAttribute('open');
          e.setInnerContent(mioloDaPergunta(faq[i], modeloFaq), { html: true });
        } else {
          e.remove();
        }
        // Perguntas a mais do que a página tinha: entram depois da última que já existia.
        if (i === modeloFaq.total - 1 && faq.length > modeloFaq.total) {
          const extras = faq.slice(modeloFaq.total)
            .map((item) => `<details${atributos(modeloFaq.details, true)}>${mioloDaPergunta(item, modeloFaq)}</details>`)
            .join('');
          e.after(extras, { html: true });
        }
      },
    });
  }

  if (mapa.size) {
    const textoDoCorpo = juntar(trocarTexto);
    leitor = leitor
      .on('body', { text(pedaco) { if (!pular && !dentroDaFaq) textoDoCorpo(pedaco); } })
      .on(ATRIBUTOS_DE_TEXTO.map((a) => `body [${a}]`).join(', '), {
        element(e) {
          for (const nome of ATRIBUTOS_DE_TEXTO) {
            const valor = e.getAttribute(nome);
            if (!valor) continue;
            const novo = mapa.get(normalizar(decodificarEntidades(valor)));
            if (novo !== undefined) e.setAttribute(nome, paraAtributo(novo));
          }
        },
      });
  }

  // Seção "outros projetos": entra logo depois do caso em destaque (o bloco escuro da página inicial).
  // Se a página mudar e esse bloco não existir mais, a seção entra no fim do conteúdo, para não se perder.
  const projetos = caminho === PAGINA_DOS_PROJETOS ? htmlDosProjetos(conteudo.projetos) : '';
  if (projetos) {
    let colocada = false;
    // Atalho no topo da página, ao lado do botão "Ver o caso do portfólio", para a vitrine ser notada logo de início.
    if (conteudo.projetos.atalho) {
      let atalhoColocado = false;
      const atalho = `<a href="#${ID_DOS_PROJETOS}" class="btn btn-ghost">${escaparHtml(conteudo.projetos.atalho)}</a>`;
      leitor = leitor.on('main a.btn-ghost[href="/portfolio"]', { element(e) { if (!atalhoColocado) { atalhoColocado = true; e.after(atalho, { html: true }); } } });
    }
    leitor = leitor
      .on('main section.bg-ink', { element(e) { if (!colocada) { colocada = true; e.after(projetos, { html: true }); } } })
      .on('main', { element(e) { try { e.onEndTag((fim) => { if (!colocada) { colocada = true; fim.before(projetos, { html: true }); } }); } catch { /* <main> sem fechamento: nada a fazer */ } } });
  }

  const cabecalhos = new Headers(resposta.headers);
  // O conteúdo mudou em relação ao arquivo original: as marcas de cache do arquivo não valem mais.
  cabecalhos.delete('ETag');
  cabecalhos.delete('Last-Modified');
  cabecalhos.delete('Content-Length');
  return leitor.transform(new Response(resposta.body, { status: resposta.status, headers: cabecalhos }));
}
