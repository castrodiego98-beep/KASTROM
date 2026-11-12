// Tela "IA e buscadores" (GEO): o que assistentes de IA e buscadores leem sobre a empresa.
//   - llms.txt: o resumo do site para assistentes de IA
//   - perfis oficiais: ligam a empresa às suas páginas em outros sites (sameAs)
//   - dados estruturados de cada página e o robots.txt, para conferência

import { h, limpar, nomeDaPagina, anexar } from '../dom.js';
import { estado, definirLlms, definirPerfis } from '../estado.js';
import { analisarPagina, buscarTexto, descobrirPaginas, tiposDe } from '../site.js';

function gerarLlms(analises, atual) {
  const inicio = analises.find((a) => a.caminho === '/');
  const organizacao = inicio?.jsonld.find((n) => tiposDe(n).includes('Organization')) || {};
  const linhas = [`# ${organizacao.name || 'KAS-Trom Projetos'}`, ''];
  const resumo = [organizacao.description, organizacao.address?.addressLocality && `${organizacao.address.addressLocality}, ${organizacao.address.addressRegion || ''}.`, organizacao.foundingDate && `Em operação desde ${organizacao.foundingDate}.`].filter(Boolean).join(' ');
  if (resumo) linhas.push(`> ${resumo}`, '');
  linhas.push('## Páginas', '');
  for (const a of analises) {
    if (/obrigado/.test(a.caminho) || a.status !== 200) continue;
    // Usa o título e a descrição do rascunho, se tiverem sido editados no painel.
    const seo = estado.trabalho.seo[a.caminho] || {};
    const titulo = (seo.titulo || a.titulo).split('|')[0].trim() || nomeDaPagina(a.caminho);
    linhas.push(`- [${a.caminho === '/' ? 'Início' : titulo}](${a.canonica || location.origin + a.caminho}): ${seo.descricao || a.descricao}`);
  }
  // Mantém as seções escritas à mão que já existem no arquivo atual (por exemplo, "Fatos de referência").
  const extras = (atual || '').split(/\n(?=## )/).filter((bloco) => /^## /.test(bloco) && !/^## Páginas/i.test(bloco));
  for (const bloco of extras) linhas.push('', bloco.trim());
  const perguntas = inicio?.faq || [];
  if (perguntas.length && !extras.some((b) => /^## Perguntas/i.test(b))) {
    linhas.push('', '## Perguntas frequentes', '');
    for (const p of estado.trabalho.faq['/'] || perguntas) linhas.push(`- **${p.pergunta}** ${p.resposta.replace(/\n\n/g, ' ')}`);
  }
  return `${linhas.join('\n')}\n`;
}

export async function montar(el) {
  const corpo = h('div', null, h('p', { class: 'carregando' }, 'Lendo o site…'));
  anexar(el, h('div', { class: 'tela' },
    h('header', { class: 'tela-cabeca' },
      h('p', { class: 'sobrelinha' }, 'Visibilidade · GEO'),
      h('h1', null, 'IA e buscadores'),
      h('p', null, 'ChatGPT, Claude, Perplexity e o próprio Google respondem perguntas citando sites. Aqui você controla o que eles encontram sobre a KAS-Trom.'),
    ),
    corpo,
  ));

  const { caminhos } = await descobrirPaginas();
  const [originais, noAr, llmsDoSite, robots] = await Promise.all([
    Promise.all(caminhos.map((c) => analisarPagina(c, 'original').catch(() => null))),
    Promise.all(caminhos.map((c) => analisarPagina(c, 'publicado').catch(() => null))),
    buscarTexto('/llms.txt?cms=original'),
    buscarTexto('/robots.txt'),
  ]);
  const analises = originais.filter(Boolean);
  const textoDoSite = llmsDoSite.status === 200 ? llmsDoSite.texto : '';
  limpar(corpo);

  // ——— llms.txt ———
  const area = h('textarea', { class: 'entrada-texto entrada-mono', id: 'llms', rows: 18, spellcheck: 'false' });
  area.value = estado.trabalho.llms ?? textoDoSite;
  const situacao = h('span', null);
  const checagem = h('ul', { style: 'margin-top:.75rem;display:grid;gap:.4rem;font-size:.875rem' });
  const pintar = () => {
    const texto = area.value;
    const editado = estado.trabalho.llms !== null;
    situacao.className = `etiqueta etiqueta-${editado ? 'info' : 'neutra'}`;
    situacao.textContent = editado ? 'editado no painel' : textoDoSite ? 'arquivo do site' : 'ainda não existe';
    const itens = [
      [/^#\s+\S/m.test(texto), 'Começa com o nome da empresa em "# Nome".'],
      [/^>\s+\S/m.test(texto), 'Tem um resumo em uma linha iniciada por ">".'],
      [caminhos.filter((c) => !/obrigado/.test(c)).every((c) => texto.includes(c === '/' ? '/)' : `${c})`)), 'Lista todas as páginas do site.'],
      [!/\]\(\//.test(texto), 'Os links usam o endereço completo (https://…).'],
      [texto.length > 300 && texto.length < 20000, `Tamanho adequado (${texto.length} caracteres).`],
    ];
    anexar(limpar(checagem), ...itens.map(([ok, rotulo]) => h('li', null, h('span', { class: `etiqueta etiqueta-${ok ? 'ok' : 'aviso'}` }, ok ? 'ok' : 'rever'), ` ${rotulo}`)));
  };
  area.addEventListener('input', () => { definirLlms(area.value, textoDoSite); pintar(); });
  pintar();

  // ——— Perfis oficiais ———
  const perfis = h('div', null);
  const desenharPerfis = () => {
    const lista = [...estado.trabalho.perfis];
    limpar(perfis);
    lista.forEach((endereco, i) => anexar(perfis, h('div', { class: 'linha-simples', style: 'margin-bottom:.5rem' },
      h('input', { class: 'entrada-texto mono', type: 'url', 'aria-label': `Perfil ${i + 1}`, placeholder: 'https://www.linkedin.com/company/…', value: endereco, oninput: (e) => { const nova = [...estado.trabalho.perfis]; nova[i] = e.target.value.trim(); definirPerfis(nova); } }),
      h('button', { type: 'button', class: 'botao botao-pequeno', 'aria-label': `Remover o perfil ${i + 1}`, onclick: () => { const nova = [...estado.trabalho.perfis]; nova.splice(i, 1); definirPerfis(nova); desenharPerfis(); } }, 'Remover'),
    )));
    anexar(perfis, h('button', { type: 'button', class: 'botao botao-pequeno', id: 'perfil-adicionar', onclick: () => { definirPerfis([...estado.trabalho.perfis, '']); desenharPerfis(); perfis.querySelector('.linha-simples:last-of-type input')?.focus(); } }, '+ Acrescentar perfil'));
  };
  desenharPerfis();

  // ——— Dados estruturados por página ———
  const linhas = noAr.filter(Boolean).map((a) => {
    const tipos = [...new Set(a.jsonld.flatMap(tiposDe))];
    const alertas = [];
    if (a.jsonldErros.length) alertas.push('JSON inválido');
    if (a.caminho !== '/' && !tipos.includes('BreadcrumbList')) alertas.push('sem trilha (BreadcrumbList)');
    if (a.faq && !tipos.includes('FAQPage')) alertas.push('perguntas sem FAQPage');
    return h('tr', null,
      h('td', null, h('strong', null, nomeDaPagina(a.caminho)), h('br'), h('span', { class: 'mono suave' }, a.caminho)),
      h('td', null, tipos.map((t) => h('span', { class: 'etiqueta etiqueta-neutra', style: 'margin:0 .3rem .3rem 0' }, t))),
      h('td', null, alertas.length ? alertas.map((x) => h('span', { class: 'etiqueta etiqueta-aviso', style: 'margin:0 .3rem .3rem 0' }, x)) : h('span', { class: 'etiqueta etiqueta-ok' }, 'ok')),
    );
  });

  anexar(corpo, 
    h('section', { class: 'cartao' },
      h('h2', null, 'llms.txt ', situacao),
      h('p', null, 'Um resumo do site em texto simples, no endereço /llms.txt. É o primeiro lugar em que vários assistentes de IA procuram para entender quem é a empresa e o que cada página contém.'),
      h('div', { class: 'campo', style: 'margin-top:1rem' }, h('label', { for: 'llms' }, 'Conteúdo do arquivo'), area),
      checagem,
      h('div', { class: 'cartao-acoes' },
        h('button', { type: 'button', class: 'botao', id: 'llms-gerar', onclick: () => { area.value = gerarLlms(analises, area.value); definirLlms(area.value, textoDoSite); pintar(); } }, 'Gerar a partir do site'),
        estado.trabalho.llms !== null || textoDoSite ? h('button', { type: 'button', class: 'botao botao-texto', onclick: () => { area.value = textoDoSite; definirLlms('', textoDoSite); pintar(); } }, 'Voltar ao arquivo do site') : null,
      ),
      h('p', { class: 'ajuda', style: 'margin-top:.75rem' }, '"Gerar a partir do site" refaz a lista de páginas com os títulos e descrições atuais e mantém as seções escritas à mão, como "Fatos de referência". Revise antes de publicar: escreva só o que é verdade e pode ser conferido.'),
    ),
    h('section', { class: 'cartao', style: 'margin-top:1.25rem' },
      h('h2', null, 'Perfis oficiais da empresa'),
      h('p', null, 'Endereços de páginas oficiais da KAS-Trom em outros sites: LinkedIn, Google Perfil da Empresa, a página do pedido de patente no INPI, cadastros profissionais. Eles entram nos dados estruturados (campo sameAs) e ajudam buscadores e assistentes a confirmar que a empresa é uma só.'),
      h('div', { style: 'margin-top:1rem' }, perfis),
    ),
    h('section', { style: 'margin-top:1.25rem' },
      h('h2', { class: 'secao-titulo' }, 'Dados estruturados no ar'),
      h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela' },
        h('thead', null, h('tr', null, h('th', null, 'Página'), h('th', null, 'Tipos declarados'), h('th', null, 'Situação'))),
        h('tbody', null, linhas))),
      h('p', { class: 'ajuda', style: 'margin-top:.6rem' }, 'Quando você edita um texto, o título, a descrição ou as perguntas pelo painel, os dados estruturados são atualizados junto. Novos tipos (como a trilha de navegação) dependem do código do site.'),
    ),
    h('section', { class: 'cartao', style: 'margin-top:1.25rem' },
      h('h2', null, 'robots.txt'),
      h('p', null, 'Diz aos robôs o que podem visitar. É um arquivo do código do site; aqui ele aparece só para conferência.'),
      h('pre', { class: 'mono', style: 'margin:1rem 0 0;padding:.9rem;background:var(--papel-fundo);font-size:.8125rem;overflow:auto' }, robots.status === 200 ? robots.texto : 'O arquivo /robots.txt não foi encontrado.'),
    ),
  );
  return null;
}
