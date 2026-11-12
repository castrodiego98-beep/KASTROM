// Tela "Visão geral": o estado do site e do rascunho, a nota da última auditoria e os próximos passos.

import { h, limpar, formatarData, plural, anexar } from '../dom.js';
import { estado, alteracoesPendentes, temAlteracoesNaoSalvas } from '../estado.js';
import { CATEGORIAS, notas, rodarAuditoria, guardarAuditoria, auditoriaGuardada } from '../auditoria-regras.js';
import { analisarPagina, descobrirPaginas } from '../site.js';
import { faixaDaNota } from './auditoria.js';
import { tratarErro } from '../acoes.js';

export async function montar(el) {
  const pendentes = alteracoesPendentes().length;
  const naoSalvas = temAlteracoesNaoSalvas();
  const cartaoSaude = h('section', { class: 'cartao' });
  const prioridades = h('div', null);
  const numeros = h('div', { class: 'grade grade-4', style: 'margin-top:1.25rem' });

  function desenharSaude(auditoria, rodando = false) {
    limpar(cartaoSaude);
    limpar(prioridades);
    if (!auditoria) {
      anexar(cartaoSaude, 
        h('p', { class: 'sobrelinha' }, 'Saúde do site'),
        h('h2', { style: 'margin-top:.4rem' }, rodando ? 'Auditando o site…' : 'Ainda sem auditoria nesta sessão'),
        h('p', null, 'A auditoria confere SEO, visibilidade em IA, tecnologia, acessibilidade e conteúdo no site que está no ar.'),
        h('div', { class: 'cartao-acoes' }, h('button', { type: 'button', class: 'botao botao-primario', disabled: rodando, onclick: rodar }, rodando ? 'Rodando…' : 'Rodar auditoria')),
      );
      return;
    }
    const n = notas(auditoria.resultados);
    anexar(cartaoSaude, 
      h('p', { class: 'sobrelinha' }, 'Saúde do site'),
      h('div', { style: 'display:flex;align-items:baseline;gap:1rem;flex-wrap:wrap;margin-top:.4rem' },
        h('span', { class: 'numero', id: 'nota-geral' }, n.geral, h('small', null, ' /100')),
        h('span', { class: 'suave' }, `${auditoria.paginas} páginas conferidas em ${formatarData(auditoria.em)}`)),
      h('div', { class: 'notas', style: 'margin-top:1rem' }, CATEGORIAS.map((c) => {
        const dados = n.porCategoria[c.id];
        return h('a', { class: 'nota', href: '#/auditoria', style: 'text-decoration:none;color:inherit', dataset: { faixa: faixaDaNota(dados.nota) } },
          h('span', { class: 'sobrelinha' }, c.nome), h('strong', { style: 'font-size:1.5rem' }, dados.nota ?? '–'),
          h('span', { class: 'nota-barra' }, h('i', { style: `width:${dados.nota ?? 0}%` })),
          h('small', null, `${dados.falha + dados.aviso} a fazer`));
      })),
      h('div', { class: 'cartao-acoes' }, h('a', { class: 'botao', href: '#/auditoria' }, 'Ver todos os resultados'), h('button', { type: 'button', class: 'botao botao-texto', onclick: rodar }, 'Rodar de novo')),
    );

    const ordem = { falha: 0, aviso: 1 };
    const abertos = auditoria.resultados.filter((r) => r.estado === 'falha' || r.estado === 'aviso');
    const noPainel = abertos.filter((r) => !r.noCodigo).sort((a, b) => ordem[a.estado] - ordem[b.estado]).slice(0, 6);
    const noCodigo = abertos.filter((r) => r.noCodigo).sort((a, b) => ordem[a.estado] - ordem[b.estado]).slice(0, 6);
    const lista = (itens) => itens.map((r) => h('article', { class: 'achado', dataset: { estado: r.estado } },
      h('div', { class: 'achado-topo' }, h('strong', null, r.titulo)),
      h('p', null, r.comoResolver || r.detalhe, r.link ? [' ', h('a', { href: r.link }, 'Abrir')] : null)));
    anexar(prioridades, h('div', { class: 'grade grade-2' },
      h('section', null, h('h2', { class: 'secao-titulo' }, 'Para resolver aqui no painel'), noPainel.length ? lista(noPainel) : h('p', { class: 'suave' }, 'Nada pendente que o painel resolva.')),
      h('section', null, h('h2', { class: 'secao-titulo' }, 'Para pedir a quem cuida do código'), noCodigo.length ? lista(noCodigo) : h('p', { class: 'suave' }, 'Nada pendente no código.')),
    ));
  }

  async function rodar() {
    desenharSaude(null, true);
    try {
      const auditoria = await rodarAuditoria();
      guardarAuditoria(auditoria);
      desenharSaude(auditoria);
    } catch (erro) {
      desenharSaude(null);
      tratarErro(erro);
    }
  }

  anexar(el, h('div', { class: 'tela' },
    h('header', { class: 'tela-cabeca' },
      h('p', { class: 'sobrelinha' }, 'Painel de controle'),
      h('h1', null, 'Visão geral'),
      h('p', null, 'O que está no ar, o que aguarda publicação e onde o site pode melhorar.'),
    ),
    h('div', { class: 'grade grade-2' },
      h('section', { class: 'cartao' },
        h('p', { class: 'sobrelinha' }, 'Publicação'),
        h('h2', { style: 'margin-top:.4rem' }, naoSalvas ? 'Há alterações não salvas' : pendentes ? `${plural(pendentes, 'alteração aguarda', 'alterações aguardam')} publicação` : 'O site está igual ao painel'),
        h('p', null, estado.publicado?.em ? `Última publicação pelo painel: ${formatarData(estado.publicado.em)}.` : 'Nenhuma publicação foi feita pelo painel ainda: o site está exatamente como foi construído.'),
        h('div', { class: 'cartao-acoes' },
          h('a', { class: `botao ${pendentes ? 'botao-destaque' : ''}`, href: '#/publicacao' }, pendentes ? 'Revisar e publicar' : 'Ver histórico'),
          h('a', { class: 'botao', href: '#/paginas' }, 'Editar páginas')),
      ),
      cartaoSaude,
    ),
    numeros,
    prioridades,
  ));

  desenharSaude(auditoriaGuardada());

  // Números do conteúdo (lidos do site)
  try {
    const { caminhos } = await descobrirPaginas();
    const analises = (await Promise.all(caminhos.map((c) => analisarPagina(c, 'original').catch(() => null)))).filter(Boolean);
    const perguntas = analises.reduce((s, a) => s + ((estado.trabalho.faq[a.caminho] || a.faq)?.length || 0), 0);
    const cartao = (rotulo, valor, detalhe, link) => h('a', { class: 'cartao', href: link, style: 'text-decoration:none;color:inherit' },
      h('p', { class: 'sobrelinha' }, rotulo), h('p', { class: 'numero', style: 'margin-top:.4rem;color:var(--tinta)' }, valor), h('p', { style: 'margin-top:.35rem' }, detalhe));
    anexar(numeros, 
      cartao('Páginas', analises.length, 'no mapa do site', '#/paginas'),
      cartao('Textos editados', Object.keys(estado.trabalho.textos).length, 'em relação ao site original', '#/paginas'),
      cartao('Perguntas frequentes', perguntas, perguntas >= 6 ? 'boa cobertura' : 'o ideal são 6 ou mais', '#/faq'),
      cartao('Outros projetos', estado.trabalho.projetos?.itens.length || 0, 'na vitrine da página inicial', '#/projetos'),
    );
  } catch { /* os números são um complemento: se falhar, a tela segue */ }
  return null;
}
