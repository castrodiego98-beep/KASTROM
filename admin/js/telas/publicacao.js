// Tela "Publicação": mostra o que mudou entre o que está no ar e o rascunho, publica e guarda o histórico.

import { api } from '../api.js';
import { h, limpar, formatarData, plural, confirmar, avisar, nomeDaPagina, anexar } from '../dom.js';
import { estado, ouvir, notificar, alteracoesPendentes, temAlteracoesNaoSalvas, publicarAgora, descartarAlteracoes, restaurarVersao, trabalhoConferido } from '../estado.js';
import { tratarErro } from '../acoes.js';
import { textosAConfirmar, MARCA_A_CONFIRMAR } from '../comum.js';
import { textosOriginaisDoSite } from '../site.js';

function descrever(m) {
  const antesDepois = (de, para) => h('p', null, h('del', null, de || '(vazio)'), ' → ', h('ins', null, para || '(vazio)'));
  if (m.tipo === 'texto') return [h('strong', null, 'Texto'), antesDepois(m.de, m.para)];
  if (m.tipo === 'seo') return [h('strong', null, `${m.campo === 'titulo' ? 'Título' : 'Descrição'} de busca · ${nomeDaPagina(m.onde)}`), antesDepois(m.de || '(original do site)', m.para || '(original do site)')];
  if (m.tipo === 'faq') {
    const linha = (lista) => (lista ? plural(lista.length, 'pergunta', 'perguntas') : 'as do site');
    return [h('strong', null, `Perguntas frequentes · ${nomeDaPagina(m.onde)}`), h('p', null, `${linha(m.de)} → ${linha(m.para)}`),
      m.para ? h('pre', null, m.para.map((p, i) => `${i + 1}. ${p.pergunta}`).join('\n')) : null];
  }
  if (m.tipo === 'llms') return [h('strong', null, 'llms.txt'), h('p', null, m.para ? `Novo conteúdo com ${m.para.length} caracteres.` : 'Volta a valer o arquivo do site.')];
  if (m.tipo === 'projetos') return [h('strong', null, 'Outros projetos (página inicial)'), h('p', null, m.para ? `Seção "${m.para.titulo}" com ${plural(m.para.itens.length, 'projeto', 'projetos')}.` : 'A seção sai da página.'),
    m.para ? h('pre', null, m.para.itens.map((p, i) => `${i + 1}. ${p.titulo}${p.video ? ' (vídeo)' : ''}`).join('\n')) : null];
  if (m.tipo === 'perfis') return [h('strong', null, 'Perfis oficiais'), h('pre', null, (m.para || []).join('\n') || '(nenhum)')];
  return [h('strong', null, 'Redirecionamentos'), h('pre', null, (m.para || []).map((r) => `${r.de} → ${r.para} (${r.codigo})`).join('\n') || '(nenhum)')];
}

export async function montar(el) {
  const pendentes = h('div', null);
  const historico = h('div', null, h('p', { class: 'carregando' }, 'Carregando o histórico…'));
  const nota = h('input', { class: 'entrada-texto', id: 'nota', type: 'text', maxlength: 200, placeholder: 'Ex.: novas perguntas frequentes e título da página de serviços' });
  const botao = h('button', { type: 'button', class: 'botao botao-destaque', id: 'publicar-agora' }, 'Publicar agora');
  const descartar = h('button', { type: 'button', class: 'botao botao-texto' }, 'Descartar todas as alterações');
  const semEfeito = h('div', null);

  function desenharPendentes() {
    const mudancas = alteracoesPendentes();
    const conferido = trabalhoConferido();
    limpar(pendentes);
    if (!conferido.ok) anexar(pendentes, h('p', { class: 'caixa-aviso', role: 'alert', style: 'margin-bottom:1rem' }, `Corrija antes de publicar: ${conferido.erros.join(' ')}`));
    if (!mudancas.length) anexar(pendentes, h('p', { class: 'caixa-info' }, 'Nada a publicar: o site está igual ao painel.'));
    else anexar(pendentes, ...mudancas.map((m) => h('div', { class: 'mudanca' }, descrever(m))));
    const aConfirmar = textosAConfirmar(conferido.conteudo);
    if (aConfirmar) anexar(pendentes, h('p', { class: 'caixa-aviso', role: 'alert', style: 'margin-top:1rem' },
      h('strong', null, `${plural(aConfirmar, 'texto ainda tem', 'textos ainda têm')} a marca ${MARCA_A_CONFIRMAR}. `),
      'Ela indica uma afirmação sobre a forma de trabalho da empresa que precisa ser conferida. Revise o texto, apague a marca e salve; só então dá para publicar.'));
    botao.disabled = !mudancas.length || !conferido.ok || aConfirmar > 0;
    botao.textContent = mudancas.length ? `Publicar ${plural(mudancas.length, 'alteração', 'alterações')}` : 'Publicar agora';
    descartar.hidden = !mudancas.length;
  }

  async function desenharHistorico() {
    try {
      const { versoes } = await api('/versoes');
      limpar(historico);
      if (!versoes.length) { anexar(historico, h('p', { class: 'suave' }, 'Ainda não houve publicações pelo painel.')); return; }
      anexar(historico, h('div', { class: 'tabela-rolagem' }, h('table', { class: 'tabela' },
        h('thead', null, h('tr', null, h('th', null, 'Quando'), h('th', null, 'O que mudou'), h('th', null, ''))),
        h('tbody', null, versoes.map((v, i) => h('tr', null,
          h('td', null, formatarData(v.em), i === 0 ? [h('br'), h('span', { class: 'etiqueta etiqueta-ok' }, 'no ar')] : null),
          h('td', null, v.nota || h('span', { class: 'suave' }, 'Sem anotação'), h('br'), h('span', { class: 'suave mono' }, v.resumo || '')),
          h('td', null, i === 0 ? null : h('button', {
            type: 'button', class: 'botao botao-pequeno',
            onclick: async () => {
              if (!(await confirmar('Trazer esta versão de volta?', 'O conteúdo desta versão vira o rascunho atual. Nada muda no site até você publicar.', 'Trazer para o rascunho'))) return;
              try { await restaurarVersao(v.id); avisar('Versão trazida para o rascunho. Revise e publique.'); } catch (erro) { tratarErro(erro); }
            },
          }, 'Restaurar')),
        ))),
      )));
    } catch (erro) {
      anexar(limpar(historico), h('p', { class: 'suave' }, 'Não foi possível carregar o histórico.'));
      tratarErro(erro);
    }
  }

  botao.addEventListener('click', async () => {
    const total = alteracoesPendentes().length;
    if (!(await confirmar(`Publicar ${plural(total, 'alteração', 'alterações')}?`, 'As mudanças passam a valer para todos os visitantes em até um minuto. Dá para voltar atrás pelo histórico.', 'Publicar'))) return;
    botao.disabled = true;
    try {
      await publicarAgora(nota.value);
      nota.value = '';
      avisar('Publicado. O site já está sendo atualizado.');
      await desenharHistorico();
    } catch (erro) {
      tratarErro(erro);
    }
    desenharPendentes();
  });

  descartar.addEventListener('click', async () => {
    if (!(await confirmar('Descartar todas as alterações?', 'O rascunho volta a ficar igual ao que está no ar. Esta ação não pode ser desfeita.', 'Descartar'))) return;
    try { await descartarAlteracoes(); avisar('Alterações descartadas.'); } catch (erro) { tratarErro(erro); }
  });

  anexar(el, h('div', { class: 'tela' },
    h('header', { class: 'tela-cabeca' },
      h('p', { class: 'sobrelinha' }, 'Qualidade'),
      h('h1', null, 'Publicação'),
      h('p', null, 'O que você edita fica no rascunho e só aparece para os visitantes depois de publicar. Cada publicação fica guardada e pode ser restaurada.'),
    ),
    h('div', { class: 'colunas' },
      h('section', null,
        h('h2', { class: 'secao-titulo', style: 'margin-top:0' }, 'Alterações aguardando publicação'),
        pendentes,
        semEfeito,
        h('div', { class: 'cartao', style: 'margin-top:1.25rem' },
          h('div', { class: 'campo' }, h('label', { for: 'nota' }, 'Anotação para o histórico (opcional)'), nota),
          h('div', { class: 'cartao-acoes' }, botao, h('a', { class: 'botao', href: '/?cms=rascunho', target: '_blank', rel: 'noopener' }, 'Ver o rascunho no site'), descartar),
          h('p', { class: 'ajuda', style: 'margin-top:.75rem' }, '"Ver o rascunho no site" mostra as alterações já salvas. Só quem está logado no painel consegue ver.'),
        ),
      ),
      h('section', null, h('h2', { class: 'secao-titulo', style: 'margin-top:0' }, 'Histórico'), historico),
    ),
  ));

  desenharPendentes();
  desenharHistorico();
  const parar = ouvir(desenharPendentes);

  // Edições cujo texto de origem não existe mais no site (o site foi reconstruído com outro texto)
  textosOriginaisDoSite().then((existentes) => {
    const orfaos = Object.keys(estado.trabalho.textos).filter((t) => !existentes.has(t));
    if (!orfaos.length) return;
    anexar(semEfeito, h('div', { class: 'caixa-aviso', style: 'margin-top:1rem' },
      h('strong', null, `${plural(orfaos.length, 'edição sem efeito', 'edições sem efeito')}. `),
      'O texto de origem não existe mais no site (o código mudou). Elas podem ser removidas: ',
      h('button', { type: 'button', class: 'botao botao-pequeno', onclick: (e) => { for (const t of orfaos) delete estado.trabalho.textos[t]; e.target.closest('.caixa-aviso').remove(); notificar(); avisar(temAlteracoesNaoSalvas() ? 'Removidas do rascunho. Salve para confirmar.' : 'Removidas.'); } }, 'Remover do rascunho'),
      h('pre', { style: 'margin:.6rem 0 0;font-size:.75rem;white-space:pre-wrap' }, orfaos.slice(0, 5).map((t) => `• ${t.slice(0, 90)}`).join('\n')),
    ));
  }).catch(() => {});

  return parar;
}
