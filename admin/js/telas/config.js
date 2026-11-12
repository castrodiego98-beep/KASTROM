// Tela "Configurações": cópia de segurança, como o painel funciona e dados da instalação.

import { validarConteudo } from '../comum.js';
import { h, baixarArquivo, confirmar, avisar, formatarData, anexar } from '../dom.js';
import { estado, substituirTrabalho, trabalhoConferido } from '../estado.js';

export async function montar(el) {
  const arquivo = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'importar-arquivo' });
  arquivo.addEventListener('change', async () => {
    const escolhido = arquivo.files?.[0];
    arquivo.value = '';
    if (!escolhido) return;
    try {
      const dados = JSON.parse(await escolhido.text());
      const conferido = validarConteudo(dados.conteudo || dados);
      if (!conferido.ok) throw new Error(conferido.erros.join(' '));
      if (!(await confirmar('Carregar esta cópia no rascunho?', 'O rascunho atual será substituído pelo conteúdo do arquivo. Nada muda no site até você salvar e publicar.', 'Carregar'))) return;
      substituirTrabalho(conferido.conteudo);
      avisar('Cópia carregada no rascunho. Salve e revise em "Publicação".');
    } catch (erro) {
      avisar(`Não foi possível ler o arquivo: ${erro.message}`, 'erro');
    }
  });

  anexar(el, h('div', { class: 'tela' },
    h('header', { class: 'tela-cabeca' },
      h('p', { class: 'sobrelinha' }, 'Sistema'),
      h('h1', null, 'Configurações'),
    ),
    h('div', { class: 'grade grade-2' },
      h('section', { class: 'cartao' },
        h('h2', null, 'Cópia de segurança'),
        h('p', null, 'Baixe um arquivo com tudo o que foi editado pelo painel (rascunho atual). Ele pode ser carregado de volta aqui a qualquer momento.'),
        h('div', { class: 'cartao-acoes' },
          h('button', { type: 'button', class: 'botao', onclick: () => baixarArquivo(`kastrom-cms-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exportadoEm: new Date().toISOString(), conteudo: trabalhoConferido().conteudo }, null, 2)) }, 'Baixar cópia'),
          h('label', { class: 'botao', for: 'importar-arquivo', tabindex: '0', onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); arquivo.click(); } } }, 'Carregar cópia…'), arquivo,
        ),
      ),
      h('section', { class: 'cartao' },
        h('h2', null, 'Esta instalação'),
        h('dl', { style: 'margin-top:.75rem;display:grid;grid-template-columns:auto 1fr;gap:.4rem 1rem;font-size:.875rem' },
          h('dt', { class: 'suave' }, 'Endereço'), h('dd', { class: 'mono' }, location.host),
          h('dt', { class: 'suave' }, 'Última publicação'), h('dd', null, formatarData(estado.publicado?.em)),
          h('dt', { class: 'suave' }, 'Rascunho salvo em'), h('dd', null, formatarData(estado.rascunho?.em)),
          h('dt', { class: 'suave' }, 'Sessão'), h('dd', null, 'termina sozinha 12 horas depois da entrada'),
        ),
      ),
    ),
    h('section', { class: 'cartao', style: 'margin-top:1.25rem' },
      h('h2', null, 'Como o painel funciona'),
      h('ul', { style: 'margin-top:.75rem;display:grid;gap:.6rem;list-style:square;padding-left:1.1rem' },
        h('li', null, h('strong', null, 'O site original não é alterado. '), 'As edições ficam guardadas na Cloudflare e são aplicadas sobre as páginas no momento da entrega. Se o painel for desligado, o site volta a ser exatamente o que foi construído.'),
        h('li', null, h('strong', null, 'Rascunho e publicação. '), 'O que você edita fica no rascunho. Só depois de "Publicar" os visitantes veem a mudança, em até um minuto.'),
        h('li', null, h('strong', null, 'Cada texto é encontrado pelo próprio texto. '), 'Por isso, um texto que aparece em vários lugares muda em todos de uma vez. Se o código do site for alterado e o texto de origem mudar, a edição perde o efeito e o painel avisa na tela "Publicação".'),
        h('li', null, h('strong', null, 'O que o painel não faz. '), 'Criar páginas, trocar imagens, mudar o desenho ou a estrutura: isso continua sendo feito no código do site.'),
        h('li', null, h('strong', null, 'Senha. '), 'Para trocar a senha, gere um novo código com "npm run senha" e atualize o segredo CMS_SENHA_HASH na Cloudflare. Trocar o CMS_SEGREDO encerra todas as sessões abertas.'),
      ),
    ),
    h('section', { class: 'cartao', style: 'margin-top:1.25rem' },
      h('h2', null, 'Atalhos'),
      h('p', null, h('kbd', { class: 'mono' }, 'Ctrl'), ' + ', h('kbd', { class: 'mono' }, 'S'), ' salva o rascunho em qualquer tela. No editor de páginas, clique em um texto da prévia para ir direto ao campo.'),
    ),
  ));
  return null;
}
