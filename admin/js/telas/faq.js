// Tela "Perguntas frequentes": edita, acrescenta, remove e reordena as perguntas.
// O que for publicado aqui muda a página e os dados estruturados (FAQPage) ao mesmo tempo.

import { LIMITES } from '../comum.js';
import { h, limpar, autoAltura, nomeDaPagina, plural, anexar } from '../dom.js';
import { estado, definirFaq } from '../estado.js';
import { analisarPagina, descobrirPaginas } from '../site.js';

export async function montar(el) {
  const corpo = h('div', null, h('p', { class: 'carregando' }, 'Procurando as perguntas no site…'));
  anexar(el, h('div', { class: 'tela' },
    h('header', { class: 'tela-cabeca' },
      h('p', { class: 'sobrelinha' }, 'Conteúdo · AEO'),
      h('h1', null, 'Perguntas frequentes'),
      h('p', null, 'Perguntas reais, com resposta direta, são o formato que o Google e os assistentes de IA mais aproveitam para responder a quem pesquisa.'),
    ),
    corpo,
  ));

  const { caminhos } = await descobrirPaginas();
  const analises = (await Promise.all(caminhos.map((c) => analisarPagina(c, 'original').catch(() => null)))).filter((a) => a?.faq);
  limpar(corpo);
  if (!analises.length) {
    anexar(corpo, h('p', { class: 'caixa-aviso' }, 'Nenhuma página do site tem um bloco de perguntas frequentes. O bloco precisa existir no código da página para o painel poder editá-lo.'));
    return null;
  }

  let analise = analises[0];
  const lista = h('div', null);
  const resumo = h('div', { class: 'cartao' });
  const seletor = analises.length > 1 ? h('select', { class: 'entrada-texto', style: 'max-width:20rem', onchange: (e) => { analise = analises.find((a) => a.caminho === e.target.value); desenhar(); } },
    analises.map((a) => h('option', { value: a.caminho }, nomeDaPagina(a.caminho)))) : null;

  const itensAtuais = () => (estado.trabalho.faq[analise.caminho] || analise.faq).map((i) => ({ ...i }));
  const gravar = (itens) => definirFaq(analise.caminho, itens, analise.faq);

  function desenharResumo(itens) {
    const curtas = itens.filter((i) => i.resposta.trim().length < 80).length;
    const semInterrogacao = itens.filter((i) => i.pergunta.trim() && !i.pergunta.trim().endsWith('?')).length;
    const vazios = itens.filter((i) => !i.pergunta.trim() || !i.resposta.trim()).length;
    const editado = Boolean(estado.trabalho.faq[analise.caminho]);
    anexar(limpar(resumo), 
      h('h2', null, 'Checagem'),
      h('ul', { style: 'margin-top:.75rem;display:grid;gap:.5rem' },
        h('li', null, h('span', { class: `etiqueta etiqueta-${itens.length >= 6 ? 'ok' : 'aviso'}` }, plural(itens.length, 'pergunta', 'perguntas')), ' ', itens.length >= 6 ? 'Boa cobertura.' : 'O ideal são 6 ou mais.'),
        vazios ? h('li', null, h('span', { class: 'etiqueta etiqueta-falha' }, plural(vazios, 'incompleta', 'incompletas')), ' Preencha pergunta e resposta antes de salvar.') : null,
        curtas ? h('li', null, h('span', { class: 'etiqueta etiqueta-aviso' }, plural(curtas, 'resposta curta', 'respostas curtas')), ' Menos de 80 caracteres informa pouco.') : null,
        semInterrogacao ? h('li', null, h('span', { class: 'etiqueta etiqueta-aviso' }, plural(semInterrogacao, 'sem "?"', 'sem "?"')), ' Escreva como o cliente perguntaria.') : null,
        h('li', null, h('span', { class: `etiqueta etiqueta-${editado ? 'info' : 'neutra'}` }, editado ? 'editado no painel' : 'igual ao site')),
      ),
      h('h3', { style: 'margin-top:1.25rem' }, 'Como escrever para ser citado'),
      h('ul', { class: 'ajuda', style: 'margin-top:.5rem;display:grid;gap:.4rem;list-style:square;padding-left:1.1rem' },
        h('li', null, 'Responda na primeira frase; detalhe depois.'),
        h('li', null, 'Use números e nomes concretos (INPI, prazos, etapas, documentos).'),
        h('li', null, 'Uma pergunta por dúvida. Prefira as que chegam por e-mail.'),
        h('li', null, 'Não prometa resultado: diga do que ele depende.'),
      ),
      editado ? h('div', { class: 'cartao-acoes' }, h('button', { type: 'button', class: 'botao botao-pequeno', onclick: () => { gravar(null); desenhar(); } }, 'Voltar às perguntas originais do site')) : null,
    );
  }

  function desenhar() {
    const itens = itensAtuais();
    limpar(lista);
    itens.forEach((item, i) => {
      const pergunta = h('input', { class: 'entrada-texto', type: 'text', id: `faq-p-${i}`, maxlength: LIMITES.pergunta, value: item.pergunta });
      const resposta = autoAltura(h('textarea', { class: 'entrada-texto', id: `faq-r-${i}`, rows: 3, maxlength: LIMITES.resposta }));
      resposta.value = item.resposta;
      const contagem = h('span', { class: 'ajuda' });
      const contar = () => { contagem.textContent = `${resposta.value.trim().length} caracteres`; };
      const aoDigitar = () => {
        const todos = itensAtuais();
        todos[i] = { pergunta: pergunta.value, resposta: resposta.value };
        gravar(todos);
        contar();
        desenharResumo(todos);
      };
      pergunta.addEventListener('input', aoDigitar);
      resposta.addEventListener('input', aoDigitar);
      contar();
      const mover = (para) => { const todos = itensAtuais(); const [tirado] = todos.splice(i, 1); todos.splice(para, 0, tirado); gravar(todos); desenhar(); };
      anexar(lista, h('div', { class: 'item-lista' },
        h('div', { class: 'item-cabeca' },
          h('span', { class: 'etapa' }, String(i + 1).padStart(2, '0')),
          h('div', { class: 'item-acoes' },
            h('button', { type: 'button', class: 'botao botao-pequeno', disabled: i === 0, 'aria-label': `Subir a pergunta ${i + 1}`, onclick: () => mover(i - 1) }, '↑'),
            h('button', { type: 'button', class: 'botao botao-pequeno', disabled: i === itens.length - 1, 'aria-label': `Descer a pergunta ${i + 1}`, onclick: () => mover(i + 1) }, '↓'),
            h('button', { type: 'button', class: 'botao botao-pequeno', disabled: itens.length === 1, 'aria-label': `Remover a pergunta ${i + 1}`, onclick: () => { const todos = itensAtuais(); todos.splice(i, 1); gravar(todos); desenhar(); } }, 'Remover'),
          ),
        ),
        h('div', { class: 'campo' }, h('label', { for: `faq-p-${i}` }, 'Pergunta'), pergunta),
        h('div', { class: 'campo' }, h('label', { for: `faq-r-${i}` }, h('span', null, 'Resposta'), contagem), resposta,
          h('p', { class: 'ajuda' }, 'Deixe uma linha em branco para separar parágrafos.')),
      ));
    });
    anexar(lista, h('div', { class: 'cartao-acoes' },
      h('button', {
        type: 'button', class: 'botao', id: 'faq-adicionar', disabled: itens.length >= LIMITES.faqItens,
        onclick: () => { const todos = itensAtuais(); todos.push({ pergunta: '', resposta: '' }); gravar(todos); desenhar(); document.getElementById(`faq-p-${todos.length - 1}`)?.focus(); },
      }, '+ Acrescentar pergunta'),
    ));
    desenharResumo(itens);
  }

  anexar(corpo, 
    seletor ? h('div', { class: 'campo', style: 'margin-bottom:1.25rem' }, h('label', null, 'Página'), seletor) : h('p', { class: 'nota-lateral', style: 'margin-bottom:1.25rem' }, `Perguntas da ${nomeDaPagina(analise.caminho).toLowerCase()} (${analise.caminho}).`),
    h('div', { class: 'colunas colunas-apoio-estreito' }, lista, resumo),
  );
  desenhar();
  return null;
}
