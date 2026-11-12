// Tela "Redirecionamentos": quando um endereço antigo deve levar a um endereço novo.

import { validarConteudo } from '../comum.js';
import { h, limpar, anexar } from '../dom.js';
import { estado, definirRedirecionamentos } from '../estado.js';

export async function montar(el) {
  const lista = h('div', null);
  const erros = h('div', null);

  const atuais = () => estado.trabalho.redirecionamentos.map((r) => ({ ...r }));
  const conferir = () => {
    const resultado = validarConteudo({ redirecionamentos: estado.trabalho.redirecionamentos });
    limpar(erros);
    if (resultado.erros.length) anexar(erros, h('p', { class: 'caixa-aviso', style: 'margin-top:1rem', role: 'alert' }, resultado.erros.join(' ')));
  };

  function desenhar() {
    const itens = atuais();
    limpar(lista);
    if (!itens.length) anexar(lista, h('p', { class: 'suave', style: 'margin-bottom:1rem' }, 'Nenhum redirecionamento cadastrado.'));
    itens.forEach((item, i) => {
      const mudar = (campo, valor) => { const todos = atuais(); todos[i][campo] = valor; definirRedirecionamentos(todos); conferir(); };
      anexar(lista, h('div', { class: 'item-lista' }, h('div', { class: 'linha-campos' },
        h('div', { class: 'campo' }, h('label', { for: `r-de-${i}` }, 'Endereço antigo'), h('input', { class: 'entrada-texto mono', id: `r-de-${i}`, type: 'text', placeholder: '/endereco-antigo', value: item.de, oninput: (e) => mudar('de', e.target.value) })),
        h('div', { class: 'campo' }, h('label', { for: `r-para-${i}` }, 'Leva para'), h('input', { class: 'entrada-texto mono', id: `r-para-${i}`, type: 'text', placeholder: '/servicos', value: item.para, oninput: (e) => mudar('para', e.target.value) })),
        h('div', { class: 'campo' }, h('label', { for: `r-cod-${i}` }, 'Tipo'), h('select', { class: 'entrada-texto', id: `r-cod-${i}`, onchange: (e) => mudar('codigo', Number(e.target.value)) },
          h('option', { value: 301, selected: item.codigo === 301 }, 'Definitivo'), h('option', { value: 302, selected: item.codigo === 302 }, 'Temporário'))),
        h('button', { type: 'button', class: 'botao botao-pequeno', 'aria-label': `Remover o redirecionamento ${i + 1}`, onclick: () => { const todos = atuais(); todos.splice(i, 1); definirRedirecionamentos(todos); desenhar(); } }, 'Remover'),
      )));
    });
    conferir();
  }

  anexar(el, h('div', { class: 'tela' },
    h('header', { class: 'tela-cabeca' },
      h('p', { class: 'sobrelinha' }, 'Visibilidade · SEO'),
      h('h1', null, 'Redirecionamentos'),
      h('p', null, 'Use quando uma página mudar de endereço ou deixar de existir: quem tiver o link antigo (e o Google) é levado ao endereço novo, sem cair em página de erro.'),
    ),
    lista,
    h('div', { class: 'cartao-acoes' }, h('button', { type: 'button', class: 'botao', id: 'redir-adicionar', onclick: () => { definirRedirecionamentos([...atuais(), { de: '', para: '', codigo: 301 }]); desenhar(); document.getElementById(`r-de-${estado.trabalho.redirecionamentos.length - 1}`)?.focus(); } }, '+ Acrescentar redirecionamento')),
    erros,
    h('p', { class: 'nota-lateral', style: 'margin-top:1.5rem' }, '"Definitivo" (301) transfere para o endereço novo a relevância que o antigo tinha no Google. Use "Temporário" (302) só para mudanças passageiras.'),
  ));
  desenhar();
  return null;
}
