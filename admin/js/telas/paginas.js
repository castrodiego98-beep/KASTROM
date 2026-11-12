// Tela "Páginas e textos": lista das páginas e o editor de cada uma (textos + busca e compartilhamento).

import { SEO } from '../comum.js';
import { h, limpar, autoAltura, ajustarAltura, nomeDaPagina, plural, anexar } from '../dom.js';
import { estado, textoAtual, definirTexto, definirSeo } from '../estado.js';
import { analisarPagina, camposEditaveis, descobrirPaginas } from '../site.js';
import { criarPrevia } from '../previa.js';

const GLOBAL = '~global';

export async function montar(el, partes) {
  if (partes[0]) return montarEditor(el, partes[0], partes[1]);
  return montarLista(el);
}

// ——— Lista ———

async function montarLista(el) {
  const grade = h('div', { class: 'grade grade-3' }, h('p', { class: 'carregando' }, 'Lendo as páginas do site…'));
  anexar(el, h('div', { class: 'tela' },
    h('header', { class: 'tela-cabeca' },
      h('p', { class: 'sobrelinha' }, 'Conteúdo'),
      h('h1', null, 'Páginas e textos'),
      h('p', null, 'Escolha uma página para editar os textos e a forma como ela aparece no Google e ao ser compartilhada.'),
    ),
    grade,
  ));

  const { caminhos } = await descobrirPaginas();
  const analises = await Promise.all(caminhos.map((c) => analisarPagina(c, 'original').catch(() => null)));
  limpar(grade);

  const editadosEm = (campos) => campos.filter((c) => estado.trabalho.textos[c.original] !== undefined).length;

  for (const analise of analises) {
    if (!analise) continue;
    const campos = camposEditaveis(analise.doc).filter((c) => c.regiao === 'conteudo');
    const editados = editadosEm(campos);
    const seo = estado.trabalho.seo[analise.caminho];
    anexar(grade, h('a', { class: 'cartao pagina-cartao', href: `#/paginas/${encodeURIComponent(analise.caminho)}` },
      h('span', { class: 'mono' }, analise.caminho),
      h('h2', null, nomeDaPagina(analise.caminho)),
      h('p', { class: 'suave' }, analise.titulo),
      h('div', { class: 'etiquetas' },
        h('span', { class: 'etiqueta etiqueta-neutra' }, plural(campos.length, 'texto', 'textos')),
        editados ? h('span', { class: 'etiqueta etiqueta-info' }, plural(editados, 'editado', 'editados')) : null,
        seo ? h('span', { class: 'etiqueta etiqueta-info' }, 'SEO editado') : null,
        analise.faq ? h('span', { class: 'etiqueta etiqueta-neutra' }, `${analise.faq.length} perguntas`) : null,
      ),
    ));
  }

  const inicio = analises.find((a) => a?.caminho === '/');
  if (inicio) {
    const globais = camposEditaveis(inicio.doc).filter((c) => c.regiao !== 'conteudo');
    const editados = editadosEm(globais);
    anexar(grade, h('a', { class: 'cartao pagina-cartao', href: `#/paginas/${encodeURIComponent(GLOBAL)}` },
      h('span', { class: 'mono' }, 'todas as páginas'),
      h('h2', null, 'Cabeçalho e rodapé'),
      h('p', { class: 'suave' }, 'Menu, nomes dos links, texto do rodapé e dados de contato que se repetem em todas as páginas.'),
      h('div', { class: 'etiquetas' },
        h('span', { class: 'etiqueta etiqueta-neutra' }, plural(globais.length, 'texto', 'textos')),
        editados ? h('span', { class: 'etiqueta etiqueta-info' }, plural(editados, 'editado', 'editados')) : null,
      ),
    ));
  }
}

// ——— Editor ———

function criarMedidor(min, max) {
  const escala = Math.round(max * 1.5);
  const barra = h('i', { class: 'medidor-barra' });
  const texto = h('span', null);
  const faixa = h('i', { class: 'medidor-faixa', style: `left:${(min / escala) * 100}%;right:${100 - (max / escala) * 100}%` });
  const elemento = h('div', { class: 'medidor' }, h('div', { class: 'medidor-trilho' }, barra, faixa), texto);
  return {
    elemento,
    atualizar(n) {
      barra.style.width = `${Math.min(100, (n / escala) * 100)}%`;
      elemento.dataset.estado = n === 0 ? 'falha' : n < min || n > max ? 'aviso' : 'ok';
      texto.textContent = `${n} caracteres (ideal: ${min} a ${max})`;
    },
  };
}

function abaSeo(analise) {
  const caminho = analise.caminho;
  const atual = (campo, original) => estado.trabalho.seo[caminho]?.[campo] ?? original;
  let hospedeiro = location.host;
  try { hospedeiro = new URL(analise.canonica).host; } catch { /* usa o endereço atual */ }
  const imagem = (() => { try { return new URL(analise.og.imagem).pathname; } catch { return ''; } })();

  const gTitulo = h('div', { class: 'google-titulo' });
  const gDescricao = h('div', { class: 'google-descricao' });
  const sTitulo = h('strong', null);
  const sDescricao = h('p', null);
  const medidorTitulo = criarMedidor(SEO.tituloMin, SEO.tituloMax);
  const medidorDescricao = criarMedidor(SEO.descricaoMin, SEO.descricaoMax);

  const titulo = h('input', { class: 'entrada-texto', id: 'seo-titulo', type: 'text', maxlength: 160, value: atual('titulo', analise.titulo) });
  const descricao = autoAltura(h('textarea', { class: 'entrada-texto', id: 'seo-descricao', rows: 3, maxlength: 400 }));
  descricao.value = atual('descricao', analise.descricao);

  const pintar = () => {
    gTitulo.textContent = titulo.value || '(sem título)';
    gDescricao.textContent = descricao.value || '(sem descrição)';
    sTitulo.textContent = titulo.value;
    sDescricao.textContent = descricao.value;
    medidorTitulo.atualizar(titulo.value.trim().length);
    medidorDescricao.atualizar(descricao.value.trim().length);
  };
  titulo.addEventListener('input', () => { definirSeo(caminho, 'titulo', titulo.value, analise.titulo); pintar(); });
  descricao.addEventListener('input', () => { definirSeo(caminho, 'descricao', descricao.value, analise.descricao); pintar(); });
  pintar();

  return h('div', null,
    h('div', { class: 'grupo' },
      h('h2', null, 'Título e descrição'),
      h('div', { class: 'campo' }, h('label', { for: 'seo-titulo' }, 'Título da página'), titulo, medidorTitulo.elemento,
        h('p', { class: 'ajuda' }, 'É a linha azul do resultado no Google e o nome da aba do navegador. Comece pelo assunto da página e termine com o nome da empresa.')),
      h('div', { class: 'campo', style: 'margin-top:1rem' }, h('label', { for: 'seo-descricao' }, 'Descrição'), descricao, medidorDescricao.elemento,
        h('p', { class: 'ajuda' }, 'O texto cinza abaixo do título. Diga o que a pessoa encontra na página e por que clicar. Se ficar em branco, vale a descrição original do site.')),
    ),
    h('div', { class: 'grupo' },
      h('h2', null, 'Como aparece no Google'),
      h('div', { class: 'google' },
        h('div', { class: 'google-site' }, h('img', { src: '/favicon-32.png', alt: '' }), h('div', null, 'KAS-Trom Projetos', h('small', null, `https://${hospedeiro}${caminho === '/' ? '' : ` › ${caminho.slice(1)}`}`))),
        gTitulo, gDescricao,
      ),
    ),
    h('div', { class: 'grupo' },
      h('h2', null, 'Como aparece ao compartilhar o link'),
      h('div', { class: 'social' }, imagem ? h('img', { src: imagem, alt: 'Imagem de compartilhamento do site' }) : null,
        h('div', null, h('small', null, hospedeiro), sTitulo, sDescricao)),
      h('p', { class: 'ajuda', style: 'margin-top:.6rem' }, 'A imagem é a mesma em todas as páginas e faz parte do código do site.'),
    ),
  );
}

async function montarEditor(el, caminhoDaRota, abaInicial) {
  const global = caminhoDaRota === GLOBAL;
  const caminho = global ? '/' : caminhoDaRota;
  const analise = await analisarPagina(caminho, 'original');
  if (analise.status !== 200 && !global) {
    anexar(el, h('div', { class: 'tela' }, h('p', { class: 'caixa-aviso' }, `A página "${caminho}" respondeu ${analise.status}.`), h('p', { style: 'margin-top:1rem' }, h('a', { href: '#/paginas' }, 'Voltar às páginas'))));
    return null;
  }
  const campos = camposEditaveis(analise.doc).filter((c) => (global ? c.regiao !== 'conteudo' : c.regiao === 'conteudo'));
  const porOriginal = new Map();

  const previa = criarPrevia(caminho, {
    aoEscolher(original) {
      const registro = porOriginal.get(original);
      if (!registro) return;
      mostrarAba('textos');
      registro.area.focus({ preventScroll: true });
      registro.caixa.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
  });

  const criarCampo = (campo, indice) => {
    const id = `campo-${indice}`;
    const area = autoAltura(h('textarea', { class: 'entrada-texto', id, rows: 1, maxlength: 6000 }));
    area.value = textoAtual(campo.original);
    const original = h('div', { class: 'campo-original', hidden: true },
      h('span', { title: campo.original }, `Original: ${campo.original}`),
      h('button', { type: 'button', class: 'botao botao-texto botao-pequeno', onclick: () => { area.value = campo.original; area.dispatchEvent(new Event('input')); area.focus(); } }, 'Desfazer'),
    );
    const vazio = h('p', { class: 'ajuda', hidden: true }, 'Em branco: este texto será removido da página.');
    const caixa = h('div', { class: 'campo campo-texto' },
      h('label', { class: 'rotulo', for: id }, h('span', null, campo.tipo), campo.vezes > 1 ? h('span', { class: 'etiqueta etiqueta-neutra', title: 'A alteração vale para todos os lugares onde este texto aparece' }, `aparece ${campo.vezes}×`) : null),
      area, original, vazio,
    );
    const marcar = () => {
      const editado = estado.trabalho.textos[campo.original] !== undefined;
      caixa.classList.toggle('editado', editado);
      original.hidden = !editado;
      vazio.hidden = area.value.trim() !== '';
    };
    area.addEventListener('keydown', (evento) => { if (evento.key === 'Enter') evento.preventDefault(); });
    area.addEventListener('input', () => { definirTexto(campo.original, area.value); previa.atualizar(campo.original); marcar(); });
    area.addEventListener('focus', () => {
      el.querySelector('.campo-texto.ativo')?.classList.remove('ativo');
      caixa.classList.add('ativo');
      previa.destacar(campo.original);
    });
    marcar();
    porOriginal.set(campo.original, { area, caixa });
    return caixa;
  };

  // Agrupa os campos pela seção (conteúdo) ou pela região (cabeçalho e rodapé)
  const grupos = new Map();
  const nomeDoGrupo = (c) => (global ? (c.regiao === 'rodape' ? 'Rodapé' : 'Cabeçalho e menu') : c.secao);
  campos.forEach((campo, i) => {
    const nome = nomeDoGrupo(campo);
    if (!grupos.has(nome)) grupos.set(nome, []);
    grupos.get(nome).push(criarCampo(campo, i));
  });
  const imagens = grupos.get('Imagens e rótulos');
  if (imagens && !global) { grupos.delete('Imagens e rótulos'); grupos.set('Imagens e rótulos', imagens); }

  const painelTextos = h('div', { role: 'tabpanel' },
    analise.faq && !global ? h('p', { class: 'caixa-info', style: 'margin-bottom:1.25rem' }, `Esta página tem ${analise.faq.length} perguntas frequentes. Elas são editadas em `, h('a', { href: '#/faq' }, 'Perguntas frequentes'), ', onde também dá para acrescentar e reordenar.') : null,
    [...grupos.entries()].map(([nome, itens]) => h('section', { class: 'grupo' }, h('h2', null, nome), itens)),
    campos.length ? null : h('p', { class: 'suave' }, 'Nenhum texto editável encontrado.'),
  );
  const painelSeo = global ? null : h('div', { role: 'tabpanel', hidden: true }, abaSeo(analise));

  const abas = {};
  const mostrarAba = (nome) => {
    if (global || !abas[nome]) return;
    for (const [chave, aba] of Object.entries(abas)) aba.setAttribute('aria-selected', String(chave === nome));
    painelTextos.hidden = nome !== 'textos';
    painelSeo.hidden = nome !== 'seo';
    for (const caixa of (nome === 'seo' ? painelSeo : painelTextos).querySelectorAll('textarea')) ajustarAltura(caixa);
  };
  const criarAba = (nome, rotulo) => (abas[nome] = h('button', { class: 'aba', type: 'button', role: 'tab', 'aria-selected': String(nome === 'textos'), onclick: () => mostrarAba(nome) }, rotulo));

  anexar(el, h('div', { class: 'editor' },
    h('div', { class: 'editor-campos' },
      h('div', { class: 'editor-cabeca' },
        h('a', { href: '#/paginas' }, '← Todas as páginas'),
        h('h1', null, global ? 'Cabeçalho e rodapé' : nomeDaPagina(caminho)),
        h('span', { class: 'mono suave' }, global ? 'aparecem em todas as páginas' : caminho),
      ),
      global ? null : h('div', { class: 'abas', role: 'tablist' }, criarAba('textos', `Textos (${campos.length})`), criarAba('seo', 'Busca e compartilhamento')),
      painelTextos, painelSeo,
    ),
    previa.elemento,
  ));
  if (abaInicial === 'seo') mostrarAba('seo');
  return null;
}
