// Tela "Auditoria do site": roda as verificações no site que está no ar e mostra o que melhorar.

import { h, limpar, formatarData, baixarArquivo, anexar } from '../dom.js';
import { CATEGORIAS, notas, rodarAuditoria, guardarAuditoria, auditoriaGuardada } from '../auditoria-regras.js';
import { limparCache } from '../site.js';
import { tratarErro } from '../acoes.js';

const ROTULO = { falha: 'corrigir', aviso: 'melhorar', ok: 'certo', info: 'saber' };
const ORDEM = { falha: 0, aviso: 1, info: 2, ok: 3 };

export function faixaDaNota(nota) {
  return nota === null ? 'sem' : nota >= 85 ? 'alta' : nota >= 65 ? 'media' : 'baixa';
}

function emTexto(auditoria) {
  const n = notas(auditoria.resultados);
  const linhas = [`# Auditoria do site ${auditoria.host}`, '', `Feita em ${formatarData(auditoria.em)}. Nota geral: ${n.geral}/100.`, ''];
  for (const categoria of CATEGORIAS) {
    const itens = auditoria.resultados.filter((r) => r.categoria === categoria.id).sort((a, b) => ORDEM[a.estado] - ORDEM[b.estado]);
    linhas.push(`## ${categoria.nome} (${n.porCategoria[categoria.id].nota ?? '–'}/100)`, '');
    for (const r of itens) {
      linhas.push(`- [${ROTULO[r.estado]}] ${r.titulo}: ${r.detalhe}${r.comoResolver ? ` Como resolver: ${r.comoResolver}` : ''}${r.noCodigo ? ' (depende do código do site)' : ''}`);
    }
    linhas.push('');
  }
  return linhas.join('\n');
}

export async function montar(el) {
  let auditoria = auditoriaGuardada();
  let categoria = null;
  let filtro = 'pendentes';

  const andamento = h('span', { class: 'suave', role: 'status' });
  const painel = h('div', null);
  const botao = h('button', { type: 'button', class: 'botao botao-primario', id: 'auditoria-rodar' }, auditoria ? 'Rodar de novo' : 'Rodar auditoria');
  const exportar = h('button', { type: 'button', class: 'botao', hidden: !auditoria, onclick: () => baixarArquivo(`auditoria-${auditoria.em.slice(0, 10)}.md`, emTexto(auditoria), 'text/markdown') }, 'Baixar relatório');

  async function rodar() {
    botao.disabled = true;
    try {
      limparCache('publicado');
      auditoria = await rodarAuditoria((mensagem) => { andamento.textContent = mensagem; });
      guardarAuditoria(auditoria);
      andamento.textContent = '';
      botao.textContent = 'Rodar de novo';
      exportar.hidden = false;
      desenhar();
    } catch (erro) {
      andamento.textContent = '';
      tratarErro(erro);
    } finally {
      botao.disabled = false;
    }
  }
  botao.addEventListener('click', rodar);

  function desenhar() {
    limpar(painel);
    if (!auditoria) {
      anexar(painel, h('p', { class: 'caixa-info' }, 'A auditoria lê todas as páginas do site como um visitante as recebe e confere cerca de 50 pontos de SEO, IA (GEO e AEO), tecnologia, acessibilidade e conteúdo. Leva alguns segundos e não altera nada.'));
      return;
    }
    const n = notas(auditoria.resultados);
    const cartoes = h('div', { class: 'notas' },
      h('button', { type: 'button', class: 'nota', 'aria-pressed': String(categoria === null), dataset: { faixa: faixaDaNota(n.geral) }, onclick: () => { categoria = null; desenhar(); } },
        h('span', { class: 'sobrelinha' }, 'Geral'), h('span', { class: 'numero' }, n.geral ?? '–', h('small', null, ' /100')),
        h('span', { class: 'nota-barra' }, h('i', { style: `width:${n.geral ?? 0}%` })), h('small', null, `${auditoria.paginas} páginas · ${formatarData(auditoria.em)}`)),
      CATEGORIAS.map((c) => {
        const dados = n.porCategoria[c.id];
        return h('button', { type: 'button', class: 'nota', 'aria-pressed': String(categoria === c.id), dataset: { faixa: faixaDaNota(dados.nota) }, title: c.descricao, onclick: () => { categoria = categoria === c.id ? null : c.id; desenhar(); } },
          h('span', { class: 'sobrelinha' }, c.nome), h('span', { class: 'numero' }, dados.nota ?? '–', h('small', null, ' /100')),
          h('span', { class: 'nota-barra' }, h('i', { style: `width:${dados.nota ?? 0}%` })),
          h('small', null, `${dados.falha} a corrigir · ${dados.aviso} a melhorar · ${dados.ok} certos`));
      }),
    );

    const daCategoria = auditoria.resultados.filter((r) => !categoria || r.categoria === categoria);
    const contar = (f) => daCategoria.filter(f).length;
    const filtros = [
      ['pendentes', `A fazer (${contar((r) => r.estado === 'falha' || r.estado === 'aviso')})`, (r) => r.estado === 'falha' || r.estado === 'aviso'],
      ['painel', `Resolvo pelo painel (${contar((r) => (r.estado === 'falha' || r.estado === 'aviso') && !r.noCodigo)})`, (r) => (r.estado === 'falha' || r.estado === 'aviso') && !r.noCodigo],
      ['codigo', `Depende do código (${contar((r) => r.estado !== 'ok' && r.noCodigo)})`, (r) => r.estado !== 'ok' && r.noCodigo],
      ['info', `Para saber (${contar((r) => r.estado === 'info')})`, (r) => r.estado === 'info'],
      ['ok', `Certos (${contar((r) => r.estado === 'ok')})`, (r) => r.estado === 'ok'],
      ['todos', `Tudo (${daCategoria.length})`, () => true],
    ];
    const ativo = filtros.find((f) => f[0] === filtro) || filtros[0];
    const visiveis = daCategoria.filter(ativo[2]).sort((a, b) => ORDEM[a.estado] - ORDEM[b.estado]);

    anexar(painel, 
      cartoes,
      h('div', { class: 'filtros', role: 'group', 'aria-label': 'Filtrar resultados' }, filtros.map(([id, rotulo]) => h('button', { type: 'button', class: 'filtro', 'aria-pressed': String(id === ativo[0]), onclick: () => { filtro = id; desenhar(); } }, rotulo))),
      visiveis.length ? visiveis.map((r) => h('article', { class: 'achado', dataset: { estado: r.estado } },
        h('div', { class: 'achado-topo' },
          h('strong', null, r.titulo),
          h('div', { class: 'achado-etiquetas' },
            h('span', { class: `etiqueta etiqueta-${r.estado}` }, ROTULO[r.estado]),
            h('span', { class: 'etiqueta etiqueta-neutra' }, CATEGORIAS.find((c) => c.id === r.categoria).nome),
            r.noCodigo && r.estado !== 'ok' ? h('span', { class: 'etiqueta etiqueta-neutra', title: 'A correção é feita no código do site, não no painel' }, 'código') : null,
          ),
        ),
        h('p', null, r.detalhe),
        r.comoResolver ? h('p', { class: 'resolver' }, h('strong', null, 'Como resolver: '), r.comoResolver, r.link ? [' ', h('a', { href: r.link }, 'Abrir no painel')] : null) : null,
      )) : h('p', { class: 'suave' }, 'Nada nesta lista.'),
    );
  }

  anexar(el, h('div', { class: 'tela' },
    h('header', { class: 'tela-cabeca' },
      h('p', { class: 'sobrelinha' }, 'Qualidade'),
      h('h1', null, 'Auditoria do site'),
      h('p', null, 'Verificações automáticas no site que está no ar. O que o painel resolve vem com um atalho; o que depende do código do site vem marcado.'),
    ),
    h('div', { class: 'cartao-acoes', style: 'margin:0 0 1.5rem' }, botao, exportar, andamento),
    painel,
    h('p', { class: 'nota-lateral', style: 'margin-top:2rem' }, 'A auditoria automática não substitui testes com pessoas: contraste de cores, navegação por teclado e leitura por leitor de tela precisam ser conferidos no navegador. Velocidade de carregamento se mede com o PageSpeed Insights do Google.'),
  ));
  desenhar();
  return null;
}
