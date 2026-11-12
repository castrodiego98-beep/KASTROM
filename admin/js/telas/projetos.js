// Tela "Outros projetos": a vitrine de projetos que aparece na página inicial, logo depois do caso em destaque.
// Cada projeto tem título, segmento, ano, uma frase de descrição, um vídeo curto (opcional) e uma capa.

import { api } from '../api.js';
import { LIMITES, TIPOS_DE_MIDIA, ID_DOS_PROJETOS, PAGINA_DOS_PROJETOS, validarConteudo } from '../comum.js';
import { h, limpar, anexar, autoAltura, avisar, plural } from '../dom.js';
import { estado, definirProjetos } from '../estado.js';
import { tratarErro } from '../acoes.js';
import { analisarPagina, descobrirPaginas, camposEditaveis } from '../site.js';

const SIGILO = /não divulgamos|projetos? de terceiros|único caso|não listamos clientes|projeto próprio/i;
const megas = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

async function enviarArquivo(arquivo, nome) {
  let resposta;
  try {
    resposta = await fetch(`/api/cms/midia?nome=${encodeURIComponent(nome || arquivo.name || 'arquivo')}`, {
      method: 'POST', body: arquivo, credentials: 'same-origin', headers: { 'Content-Type': arquivo.type || 'application/octet-stream' },
    });
  } catch {
    throw new Error('Sem conexão com o servidor.');
  }
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw Object.assign(new Error(dados.erro || `Erro ${resposta.status}.`), { status: resposta.status });
  return dados.arquivo;
}

/** Tira uma "foto" do vídeo (por volta de 1 segundo) para servir de capa. Devolve um arquivo JPG ou null. */
function capaDoVideo(arquivo) {
  return new Promise((resolver) => {
    const video = document.createElement('video');
    const endereco = URL.createObjectURL(arquivo);
    const terminar = (resultado) => { URL.revokeObjectURL(endereco); resolver(resultado); };
    const limite = setTimeout(() => terminar(null), 15000);
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.addEventListener('error', () => { clearTimeout(limite); terminar(null); });
    video.addEventListener('loadedmetadata', () => { video.currentTime = Math.min(1, (video.duration || 2) / 3); });
    video.addEventListener('seeked', () => {
      clearTimeout(limite);
      try {
        const largura = Math.min(1280, video.videoWidth || 1280);
        const altura = Math.round(largura * ((video.videoHeight || 720) / (video.videoWidth || 1280)));
        const tela = document.createElement('canvas');
        tela.width = largura;
        tela.height = altura;
        tela.getContext('2d').drawImage(video, 0, 0, largura, altura);
        tela.toBlob((imagem) => terminar(imagem), 'image/jpeg', 0.82);
      } catch {
        terminar(null);
      }
    });
    video.src = endereco;
  });
}

export async function montar(el) {
  const lista = h('div', null);
  const alertas = h('div', null);
  const biblioteca = h('section', { class: 'cartao', style: 'margin-top:1.25rem' });
  const titulo = h('input', { class: 'entrada-texto', id: 'proj-titulo', type: 'text', maxlength: LIMITES.projetoTitulo });
  const texto = autoAltura(h('textarea', { class: 'entrada-texto', id: 'proj-texto', rows: 2, maxlength: 600 }));
  const atalho = h('input', { class: 'entrada-texto', id: 'proj-atalho', type: 'text', maxlength: 60 });
  const PADRAO = { titulo: 'Outros projetos', texto: 'Uma amostra de projetos de máquinas e equipamentos desenvolvidos pela KAS-Trom.', atalho: 'Ver outros projetos', itens: [] };

  const atual = () => {
    const p = estado.trabalho.projetos || PADRAO;
    return { titulo: p.titulo, texto: p.texto, atalho: p.atalho ?? '', itens: p.itens.map((i) => ({ ...i })) };
  };
  const pendencias = h('div', null);
  // Mostra o que falta preencher: um projeto incompleto não é salvo.
  const conferir = (p) => {
    const erros = p.itens.length ? validarConteudo({ projetos: p }).erros : [];
    limpar(pendencias);
    if (erros.length) anexar(pendencias, h('p', { class: 'caixa-aviso', role: 'alert', style: 'margin-top:1rem' }, h('strong', null, 'Complete para poder salvar: '), erros.join(' ')));
  };
  const gravar = (mudar) => {
    const p = atual();
    p.titulo = titulo.value;
    p.texto = texto.value;
    p.atalho = atalho.value;
    mudar(p);
    definirProjetos(p);
    conferir(p);
  };

  titulo.value = atual().titulo;
  texto.value = atual().texto;
  atalho.value = atual().atalho;
  atalho.addEventListener('input', () => gravar(() => {}));
  titulo.addEventListener('input', () => gravar(() => {}));
  texto.addEventListener('input', () => gravar(() => {}));

  async function desenharBiblioteca() {
    try {
      const { arquivos } = await api('/midia');
      const emUso = new Set((estado.trabalho.projetos?.itens || []).flatMap((i) => [i.video, i.capa]));
      const total = arquivos.reduce((s, a) => s + a.bytes, 0);
      const semUso = arquivos.filter((a) => !emUso.has(a.endereco));
      anexar(limpar(biblioteca),
        h('h2', null, 'Arquivos enviados'),
        h('p', null, `${plural(arquivos.length, 'arquivo', 'arquivos')}, ${megas(total)} no total. Cada arquivo pode ter até ${megas(LIMITES.midiaBytes)}.`),
        semUso.length ? h('div', { class: 'tabela-rolagem', style: 'margin-top:1rem' }, h('table', { class: 'tabela' },
          h('thead', null, h('tr', null, h('th', null, 'Sem uso em nenhum projeto'), h('th', null, 'Tamanho'), h('th', null, ''))),
          h('tbody', null, semUso.map((a) => h('tr', null,
            h('td', null, a.nome || a.chave, h('br'), h('span', { class: 'mono suave' }, TIPOS_DE_MIDIA[a.tipo] || a.tipo)),
            h('td', null, megas(a.bytes)),
            h('td', null, h('button', {
              type: 'button', class: 'botao botao-pequeno',
              onclick: async () => { try { await api(`/midia/${a.chave}`, { metodo: 'DELETE' }); avisar('Arquivo apagado.'); desenharBiblioteca(); } catch (erro) { tratarErro(erro); } },
            }, 'Apagar')),
          ))),
        )) : null,
      );
    } catch (erro) {
      anexar(limpar(biblioteca), h('h2', null, 'Arquivos enviados'), h('p', null, 'Não foi possível listar os arquivos.'));
    }
  }

  function desenhar() {
    const { itens } = atual();
    limpar(lista);
    if (!itens.length) anexar(lista, h('p', { class: 'caixa-info', style: 'margin-bottom:1rem' }, 'Nenhum projeto cadastrado: a seção não aparece no site. Acrescente o primeiro projeto abaixo.'));

    itens.forEach((item, i) => {
      const mudar = (campo, valor) => gravar((p) => { p.itens[i][campo] = valor; });
      const mover = (para) => { gravar((p) => { const [tirado] = p.itens.splice(i, 1); p.itens.splice(para, 0, tirado); }); desenhar(); };
      const situacao = h('p', { class: 'ajuda', role: 'status' }, item.video ? 'Vídeo enviado.' : 'Sem vídeo: o cartão mostra só a capa.');
      const miniatura = item.capa
        ? h('img', { src: item.capa, alt: `Capa de ${item.titulo || 'projeto'}`, style: 'width:100%;aspect-ratio:16/9;object-fit:cover;border:1px solid var(--tinta);background:var(--tinta)' })
        : h('div', { style: 'width:100%;aspect-ratio:16/9;display:grid;place-items:center;border:1px dashed var(--aco);color:var(--aco);font-size:.8125rem' }, 'Sem capa');

      const escolherVideo = h('input', { type: 'file', accept: 'video/mp4,video/webm', class: 'sr-only', id: `proj-video-${i}` });
      escolherVideo.addEventListener('change', async () => {
        const arquivo = escolherVideo.files?.[0];
        escolherVideo.value = '';
        if (!arquivo) return;
        if (arquivo.size > LIMITES.midiaBytes) { avisar(`O vídeo tem ${megas(arquivo.size)}; o limite é ${megas(LIMITES.midiaBytes)}. Reduza com "npm run videos" (veja a ajuda no fim da página).`, 'erro'); return; }
        try {
          situacao.textContent = 'Enviando o vídeo…';
          const enviado = await enviarArquivo(arquivo, arquivo.name);
          let capa = item.capa;
          situacao.textContent = 'Gerando a capa…';
          const imagem = await capaDoVideo(arquivo);
          if (imagem) capa = (await enviarArquivo(imagem, `capa de ${arquivo.name}.jpg`)).endereco;
          gravar((p) => { p.itens[i].video = enviado.endereco; p.itens[i].capa = capa; });
          avisar(imagem ? 'Vídeo enviado e capa gerada.' : 'Vídeo enviado. Não consegui gerar a capa neste navegador: envie uma imagem.', imagem ? 'ok' : 'info');
          desenhar();
          desenharBiblioteca();
        } catch (erro) {
          situacao.textContent = '';
          tratarErro(erro);
        }
      });
      const escolherCapa = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'sr-only', id: `proj-capa-${i}` });
      escolherCapa.addEventListener('change', async () => {
        const arquivo = escolherCapa.files?.[0];
        escolherCapa.value = '';
        if (!arquivo) return;
        try {
          const enviado = await enviarArquivo(arquivo, arquivo.name);
          mudar('capa', enviado.endereco);
          desenhar();
          desenharBiblioteca();
        } catch (erro) { tratarErro(erro); }
      });
      const botaoDeArquivo = (entrada, rotulo) => h('label', { class: 'botao botao-pequeno', for: entrada.id, tabindex: '0', onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.click(); } } }, rotulo);

      const descricao = autoAltura(h('textarea', { class: 'entrada-texto', id: `proj-desc-${i}`, rows: 2, maxlength: LIMITES.projetoDescricao, oninput: (e) => mudar('descricao', e.target.value) }));
      descricao.value = item.descricao;

      anexar(lista, h('div', { class: 'item-lista' },
        h('div', { class: 'item-cabeca' },
          h('span', { class: 'etapa' }, String(i + 1).padStart(2, '0')),
          h('div', { class: 'item-acoes' },
            h('button', { type: 'button', class: 'botao botao-pequeno', disabled: i === 0, 'aria-label': `Subir o projeto ${i + 1}`, onclick: () => mover(i - 1) }, '↑'),
            h('button', { type: 'button', class: 'botao botao-pequeno', disabled: i === itens.length - 1, 'aria-label': `Descer o projeto ${i + 1}`, onclick: () => mover(i + 1) }, '↓'),
            h('button', { type: 'button', class: 'botao botao-pequeno', 'aria-label': `Remover o projeto ${i + 1}`, onclick: () => { gravar((p) => { p.itens.splice(i, 1); }); desenhar(); desenharBiblioteca(); } }, 'Remover'),
          ),
        ),
        h('div', { class: 'projeto-campos' },
          h('div', { style: 'display:grid;gap:.5rem;align-content:start' }, miniatura,
            h('div', { class: 'item-acoes', style: 'flex-wrap:wrap' }, botaoDeArquivo(escolherVideo, item.video ? 'Trocar vídeo…' : 'Enviar vídeo…'), botaoDeArquivo(escolherCapa, 'Enviar capa…'), escolherVideo, escolherCapa),
            situacao),
          h('div', { style: 'display:grid;gap:.75rem;align-content:start' },
            h('div', { class: 'campo' }, h('label', { for: `proj-nome-${i}` }, 'Nome do projeto'), h('input', { class: 'entrada-texto', id: `proj-nome-${i}`, type: 'text', maxlength: LIMITES.projetoTitulo, value: item.titulo, placeholder: 'Ex.: Varredor frontal para tratores', oninput: (e) => mudar('titulo', e.target.value) })),
            h('div', { style: 'display:grid;gap:.75rem;grid-template-columns:minmax(0,1fr) 7rem' },
              h('div', { class: 'campo' }, h('label', { for: `proj-seg-${i}` }, 'Segmento'), h('input', { class: 'entrada-texto', id: `proj-seg-${i}`, type: 'text', maxlength: 60, value: item.segmento, placeholder: 'Ex.: Máquinas agrícolas', oninput: (e) => mudar('segmento', e.target.value) })),
              h('div', { class: 'campo' }, h('label', { for: `proj-ano-${i}` }, 'Ano'), h('input', { class: 'entrada-texto', id: `proj-ano-${i}`, type: 'text', maxlength: 20, inputmode: 'numeric', value: item.ano, placeholder: '2024', oninput: (e) => mudar('ano', e.target.value) })),
            ),
            h('div', { class: 'campo' }, h('label', { for: `proj-desc-${i}` }, 'O que foi feito (uma ou duas frases)'), descricao),
          ),
        ),
      ));
    });

    anexar(lista, h('div', { class: 'cartao-acoes' },
      h('button', { type: 'button', class: 'botao', id: 'proj-adicionar', disabled: itens.length >= LIMITES.projetos, onclick: () => { gravar((p) => { p.itens.push({ titulo: '', segmento: '', ano: '', descricao: '', video: '', capa: '' }); }); desenhar(); document.getElementById(`proj-nome-${atual().itens.length - 1}`)?.focus(); } }, '+ Acrescentar projeto'),
      h('a', { class: 'botao botao-texto', href: `${PAGINA_DOS_PROJETOS}?cms=rascunho#${ID_DOS_PROJETOS}`, target: '_blank', rel: 'noopener' }, 'Ver o rascunho salvo no site'),
    ));
  }

  el.append(h('div', { class: 'tela' },
    h('header', { class: 'tela-cabeca' },
      h('p', { class: 'sobrelinha' }, 'Conteúdo'),
      h('h1', null, 'Outros projetos'),
      h('p', null, 'Uma vitrine na página inicial, logo depois do caso em destaque: vídeos curtos de mockups e uma frase sobre cada projeto.'),
    ),
    h('p', { class: 'caixa-aviso', style: 'margin-bottom:1.25rem' },
      h('strong', null, 'Antes de publicar um projeto, confira se ele pode ser mostrado. '),
      'Projetos feitos para clientes costumam ter acordo de confidencialidade (NDA). Use nomes genéricos, sem citar o cliente, e só publique o que o contrato permite. Repare também se o nome ou a marca do cliente aparece dentro do vídeo.'),
    alertas,
    h('section', { class: 'cartao', style: 'margin-bottom:1.25rem' },
      h('h2', null, 'Abertura da seção'),
      h('div', { class: 'campo', style: 'margin-top:.75rem' }, h('label', { for: 'proj-titulo' }, 'Título'), titulo),
      h('div', { class: 'campo', style: 'margin-top:.75rem' }, h('label', { for: 'proj-texto' }, 'Texto de abertura'), texto),
      h('div', { class: 'campo', style: 'margin-top:.75rem' }, h('label', { for: 'proj-atalho' }, 'Botão no topo da página inicial'), atalho,
        h('p', { class: 'ajuda' }, 'Aparece ao lado de "Ver o caso do portfólio" e leva direto a esta seção. Deixe em branco para não mostrar o botão.')),
    ),
    lista,
    pendencias,
    biblioteca,
    h('section', { class: 'cartao', style: 'margin-top:1.25rem' },
      h('h2', null, 'Como preparar os vídeos'),
      h('ul', { style: 'margin-top:.75rem;display:grid;gap:.5rem;list-style:square;padding-left:1.1rem' },
        h('li', null, 'Use vídeos curtos (5 a 20 segundos), em MP4, sem som. Eles aparecem com a capa e só carregam quando o visitante dá o play.'),
        h('li', null, `Limite de ${megas(LIMITES.midiaBytes)} por arquivo. Os mockups costumam sair do programa de 3D com 10 a 50 MB; o comando `, h('code', { class: 'mono' }, 'npm run videos -- pasta-de-origem pasta-de-destino'), ' reduz cada um para 1 a 3 MB sem perda visível e já gera as capas.'),
        h('li', null, 'A capa é tirada do próprio vídeo, automaticamente. Se preferir outra imagem, use "Enviar capa".'),
        h('li', null, 'De 3 a 9 projetos é o ideal: variedade suficiente sem alongar demais a página.'),
      ),
    ),
  ));

  desenhar();
  conferir(atual());
  desenharBiblioteca();

  // Frases do site que dizem que a empresa não mostra outros projetos: precisam ser revistas junto.
  descobrirPaginas().then(async ({ caminhos }) => {
    const achados = [];
    for (const caminho of caminhos) {
      const analise = await analisarPagina(caminho, 'original').catch(() => null);
      if (!analise) continue;
      for (const campo of camposEditaveis(analise.doc)) if (campo.regiao === 'conteudo' && SIGILO.test(campo.original)) achados.push({ caminho, texto: campo.original });
    }
    if (!achados.length) return;
    anexar(alertas, h('div', { class: 'caixa-info', style: 'margin-bottom:1.25rem' },
      h('strong', null, `${plural(achados.length, 'frase do site diz', 'frases do site dizem')} que a empresa não mostra outros projetos. `),
      'Ao publicar esta seção, ajuste esses textos (e a seção "Sigilo" do llms.txt, em "IA e buscadores") para não se contradizerem:',
      h('ul', { style: 'margin-top:.5rem;display:grid;gap:.4rem;list-style:square;padding-left:1.1rem' },
        achados.map((a) => h('li', null, `"${a.texto.slice(0, 150)}${a.texto.length > 150 ? '…' : ''}" `, h('a', { href: `#/paginas/${encodeURIComponent(a.caminho)}` }, 'Editar')))),
    ));
  }).catch(() => {});

  return null;
}
