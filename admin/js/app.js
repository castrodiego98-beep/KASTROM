// Ponto de partida do painel: confere a sessão, monta a estrutura (menu lateral e barra do topo)
// e troca de tela conforme o endereço (#/paginas, #/faq, ...).

import { api } from './api.js';
import { h, limpar, plural, confirmar, anexar } from './dom.js';
import { estado, ouvir, carregarConteudo, temAlteracoesNaoSalvas, alteracoesPendentes } from './estado.js';
import { salvar, tratarErro } from './acoes.js';

const raiz = document.getElementById('app');

const TELAS = [
  { rota: '', nome: 'Visão geral', grupo: null, carregar: () => import('./telas/visao.js') },
  { rota: 'paginas', nome: 'Páginas e textos', grupo: 'Conteúdo', carregar: () => import('./telas/paginas.js') },
  { rota: 'faq', nome: 'Perguntas frequentes', grupo: 'Conteúdo', carregar: () => import('./telas/faq.js') },
  { rota: 'projetos', nome: 'Outros projetos', grupo: 'Conteúdo', carregar: () => import('./telas/projetos.js') },
  { rota: 'ia', nome: 'IA e buscadores', grupo: 'Visibilidade', carregar: () => import('./telas/ia.js') },
  { rota: 'redirecionamentos', nome: 'Redirecionamentos', grupo: 'Visibilidade', carregar: () => import('./telas/redirecionamentos.js') },
  { rota: 'auditoria', nome: 'Auditoria do site', grupo: 'Qualidade', carregar: () => import('./telas/auditoria.js') },
  { rota: 'publicacao', nome: 'Publicação', grupo: 'Qualidade', carregar: () => import('./telas/publicacao.js') },
  { rota: 'config', nome: 'Configurações', grupo: 'Sistema', carregar: () => import('./telas/config.js') },
];

let desmontar = null;
let rotaAtual = null;

// ——— Entrada ———

function telaDeConfiguracao(faltando) {
  const nomes = {
    CMS: 'a ligação com o banco KV chamada CMS',
    CMS_SENHA_HASH: 'o segredo CMS_SENHA_HASH (a senha embaralhada)',
    CMS_SEGREDO: 'o segredo CMS_SEGREDO (com pelo menos 32 caracteres)',
  };
  anexar(limpar(raiz), h('main', { class: 'entrada' }, h('div', { class: 'entrada-caixa' },
    h('p', { class: 'sobrelinha' }, 'Painel KAS-Trom'),
    h('h1', null, 'Falta configurar'),
    h('p', null, 'O painel está instalado, mas a Cloudflare ainda não tem tudo de que ele precisa. Falta:'),
    h('ul', { class: 'entrada-lista' }, faltando.map((f) => h('li', null, nomes[f] || f))),
    h('p', null, 'O passo a passo está em ', h('code', null, 'docs/INTEGRACAO.md'), ' no repositório.'),
  )));
}

function telaDeEntrada() {
  const erro = h('p', { class: 'entrada-erro', role: 'alert', hidden: true });
  const senha = h('input', { class: 'entrada-texto', type: 'password', id: 'senha', name: 'senha', autocomplete: 'current-password', required: true });
  const botao = h('button', { class: 'botao botao-primario', type: 'submit' }, 'Entrar');
  const formulario = h('form', {
    onsubmit: async (evento) => {
      evento.preventDefault();
      botao.disabled = true;
      botao.textContent = 'Entrando…';
      erro.hidden = true;
      try {
        await api('/entrar', { metodo: 'POST', corpo: { senha: senha.value } });
        await iniciar();
      } catch (falha) {
        erro.textContent = falha.message;
        erro.hidden = false;
        botao.disabled = false;
        botao.textContent = 'Entrar';
        senha.select();
      }
    },
  },
    h('div', { class: 'campo' }, h('label', { for: 'senha' }, 'Senha'), senha),
    erro,
    botao,
  );
  anexar(limpar(raiz), h('main', { class: 'entrada' }, h('div', { class: 'entrada-caixa' },
    h('p', { class: 'sobrelinha' }, 'Painel KAS-Trom'),
    h('h1', null, 'Entrar no painel'),
    h('p', null, 'Edite textos, perguntas frequentes e a apresentação do site nos buscadores e assistentes de IA.'),
    formulario,
  )));
  senha.focus();
}

// ——— Estrutura ———

function partesDaRota() {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

function montarEstrutura() {
  const navegacao = h('nav', { 'aria-label': 'Seções do painel' });
  let grupoAnterior;
  for (const tela of TELAS) {
    if (tela.grupo && tela.grupo !== grupoAnterior) anexar(navegacao, h('p', { class: 'lateral-grupo' }, tela.grupo));
    grupoAnterior = tela.grupo;
    anexar(navegacao, h('a', { href: `#/${tela.rota}`, dataset: { rota: tela.rota } }, h('span', null, tela.nome)));
  }

  const estadoTexto = h('span', null);
  const ponto = h('span', { class: 'ponto', 'aria-hidden': 'true' });
  const botaoSalvar = h('button', { class: 'botao', type: 'button', id: 'botao-salvar', onclick: salvar }, 'Salvar rascunho');
  const botaoPublicar = h('a', { class: 'botao botao-destaque', href: '#/publicacao', id: 'botao-publicar' }, 'Publicar…');
  const conteudo = h('div', { id: 'tela' });

  anexar(limpar(raiz), h('div', { class: 'estrutura' },
    h('aside', { class: 'lateral' },
      h('div', { class: 'lateral-marca' }, h('p', { class: 'sobrelinha' }, 'Painel de controle'), h('strong', null, 'KAS-Trom')),
      navegacao,
      h('div', { class: 'lateral-pe' },
        h('a', { href: '/', target: '_blank', rel: 'noopener' }, 'Abrir o site'),
        h('button', {
          type: 'button',
          onclick: async () => {
            if (temAlteracoesNaoSalvas() && !(await confirmar('Sair sem salvar?', 'Há alterações que ainda não foram salvas no rascunho. Elas serão perdidas.', 'Sair mesmo assim'))) return;
            sairSemPerguntar = true;
            try { await api('/sair', { metodo: 'POST', corpo: {} }); } catch { /* sai de qualquer jeito */ }
            location.reload();
          },
        }, 'Sair'),
      ),
    ),
    h('div', { class: 'principal' },
      h('header', { class: 'barra' },
        h('div', { class: 'barra-estado', role: 'status' }, ponto, estadoTexto),
        h('div', { class: 'barra-acoes' }, botaoSalvar, botaoPublicar),
      ),
      conteudo,
    ),
  ));

  const atualizarBarra = () => {
    const sujo = temAlteracoesNaoSalvas();
    const pendentes = alteracoesPendentes().length;
    ponto.className = `ponto${sujo ? ' sujo' : pendentes ? ' pendente' : ''}`;
    estadoTexto.textContent = estado.salvando ? 'Salvando…'
      : sujo ? 'Há alterações não salvas'
      : pendentes ? `Rascunho salvo: ${plural(pendentes, 'alteração aguarda', 'alterações aguardam')} publicação`
      : 'Tudo publicado: o site está igual ao painel';
    botaoSalvar.disabled = !sujo || estado.salvando;
    botaoPublicar.textContent = pendentes ? `Publicar (${pendentes})…` : 'Publicação';
    botaoPublicar.className = `botao ${pendentes ? 'botao-destaque' : ''}`;
    const linkPublicacao = navegacao.querySelector('[data-rota="publicacao"]');
    linkPublicacao.querySelector('.contagem')?.remove();
    if (pendentes) anexar(linkPublicacao, h('span', { class: 'contagem', title: 'Alterações aguardando publicação' }, String(pendentes)));
  };
  ouvir(atualizarBarra);
  atualizarBarra();

  return { navegacao, conteudo };
}

let estrutura = null;
let sairSemPerguntar = false;

async function navegar() {
  const partes = partesDaRota();
  const tela = TELAS.find((t) => t.rota === (partes[0] || '')) || TELAS[0];
  const chave = partes.join('/');
  if (chave === rotaAtual) return;
  rotaAtual = chave;
  for (const link of estrutura.navegacao.querySelectorAll('a')) {
    if (link.dataset.rota === tela.rota) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  }
  if (typeof desmontar === 'function') desmontar();
  desmontar = null;
  anexar(limpar(estrutura.conteudo), h('p', { class: 'carregando' }, 'Carregando…'));
  document.title = `${tela.nome} | Painel KAS-Trom`;
  try {
    const modulo = await tela.carregar();
    if (rotaAtual !== chave) return;
    limpar(estrutura.conteudo);
    desmontar = await modulo.montar(estrutura.conteudo, partes.slice(1));
    if (!partes[1]) window.scrollTo(0, 0);
  } catch (erro) {
    anexar(limpar(estrutura.conteudo), h('div', { class: 'tela' }, h('p', { class: 'caixa-aviso' }, `Não foi possível abrir esta tela: ${erro.message}`)));
    tratarErro(erro);
  }
}

async function iniciar() {
  let sessao;
  try {
    sessao = await api('/sessao');
  } catch (erro) {
    anexar(limpar(raiz), h('p', { class: 'carregando' }, `Não foi possível falar com o servidor do painel. ${erro.message}`));
    return;
  }
  estado.sessao = sessao;
  if (!sessao.configurado) return telaDeConfiguracao(sessao.faltando);
  if (!sessao.autenticado) return telaDeEntrada();

  try {
    await carregarConteudo();
  } catch (erro) {
    if (erro.status === 401) return telaDeEntrada();
    anexar(limpar(raiz), h('p', { class: 'carregando' }, `Não foi possível carregar o conteúdo. ${erro.message}`));
    return;
  }
  estrutura = montarEstrutura();
  rotaAtual = null;
  window.addEventListener('hashchange', navegar);
  await navegar();
}

window.addEventListener('keydown', (evento) => {
  if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 's') {
    evento.preventDefault();
    if (estrutura) salvar();
  }
});
window.addEventListener('beforeunload', (evento) => {
  if (!sairSemPerguntar && estrutura && temAlteracoesNaoSalvas()) { evento.preventDefault(); evento.returnValue = ''; }
});

iniciar();
