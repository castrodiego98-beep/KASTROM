// A prévia ao vivo: a página do site dentro de uma moldura, com as edições aplicadas enquanto você digita.
// A página é carregada na versão original e o painel troca os textos nela, do mesmo jeito que a Cloudflare
// fará depois de publicar. Para conferir o resultado final de verdade, use "Abrir prévia real".

import { SELETOR_FAQ } from './comum.js';
import { h, anexar } from './dom.js';
import { estado, textoAtual } from './estado.js';
import { textosDoDocumento, atributosDoDocumento } from './site.js';

export function criarPrevia(caminho, { aoEscolher } = {}) {
  const moldura = h('iframe', { title: 'Prévia da página com as edições', src: `${caminho}?cms=original` });
  const quadro = h('div', { class: 'previa-moldura' }, moldura);
  const palco = h('div', { class: 'previa-palco', dataset: { modo: 'computador' } }, quadro);

  // No modo "Computador" a página é desenhada com 1280 px de largura e reduzida para caber no espaço,
  // para mostrar o layout de tela grande mesmo com a prévia estreita. No modo "Celular", 390 px, sem redução.
  const LARGURA_COMPUTADOR = 1280;
  const ajustarTamanho = () => {
    const largura = quadro.clientWidth;
    const altura = quadro.clientHeight;
    if (!largura || !altura) return;
    const escala = palco.dataset.modo === 'celular' ? 1 : Math.min(1, largura / LARGURA_COMPUTADOR);
    moldura.style.width = `${Math.round(largura / escala)}px`;
    moldura.style.height = `${Math.round(altura / escala)}px`;
    moldura.style.transform = escala === 1 ? '' : `scale(${escala})`;
  };
  new ResizeObserver(ajustarTamanho).observe(quadro);

  const botao = (modo, rotulo) => h('button', {
    type: 'button', 'aria-pressed': String(modo === 'computador'),
    onclick: (evento) => {
      palco.dataset.modo = modo;
      for (const b of evento.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === evento.currentTarget));
      ajustarTamanho();
    },
  }, rotulo);
  const elemento = h('div', { class: 'editor-previa' },
    h('div', { class: 'previa-barra' },
      h('span', null, 'Prévia ao vivo. Clique em um texto para editá-lo.'),
      h('div', { class: 'alternador', role: 'group', 'aria-label': 'Largura da prévia' }, botao('computador', 'Computador'), botao('celular', 'Celular')),
      h('a', { href: `${caminho}?cms=rascunho`, target: '_blank', rel: 'noopener', title: 'Abre a página como a Cloudflare vai entregar, com o rascunho salvo' }, 'Abrir prévia real'),
    ),
    palco,
  );

  let textos = new Map(); // texto original → [{ no, antes, depois }]
  let atributos = new Map(); // texto original → [{ elemento, atributo }]
  let porElemento = new WeakMap();
  let modeloFaq = null;
  let faqOriginal = [];
  let destacado = null;

  const escrever = (original) => {
    const valor = textoAtual(original);
    for (const { no, antes, depois } of textos.get(original) || []) no.nodeValue = antes + valor + depois;
    for (const { elemento: el, atributo } of atributos.get(original) || []) el.setAttribute(atributo, valor);
  };

  const montarFaq = () => {
    const doc = moldura.contentDocument;
    if (!doc || !modeloFaq) return;
    const itens = estado.trabalho.faq[caminho] || faqOriginal;
    const atuais = [...doc.querySelectorAll(SELETOR_FAQ)];
    const ancora = atuais[0];
    if (!ancora) return;
    const novos = itens.map((item) => {
      const bloco = modeloFaq.cloneNode(true);
      bloco.removeAttribute('open');
      const resumo = bloco.querySelector(':scope > summary');
      const textoDoResumo = [...resumo.childNodes].find((n) => n.nodeType === 3);
      if (textoDoResumo) textoDoResumo.nodeValue = item.pergunta; else resumo.prepend(item.pergunta);
      const paragrafos = [...bloco.querySelectorAll(':scope > p')];
      const modeloP = paragrafos[0];
      paragrafos.slice(1).forEach((p) => p.remove());
      const partes = item.resposta.split('\n\n');
      if (modeloP) {
        modeloP.textContent = partes[0];
        let anterior = modeloP;
        for (const parte of partes.slice(1)) { const p = modeloP.cloneNode(false); p.textContent = parte; anterior.after(p); anterior = p; }
      }
      return bloco;
    });
    ancora.before(...novos);
    atuais.forEach((b) => b.remove());
  };

  moldura.addEventListener('load', () => {
    const doc = moldura.contentDocument;
    if (!doc?.body) return;
    textos = new Map();
    atributos = new Map();
    porElemento = new WeakMap();
    for (const { no, original, elemento: el } of textosDoDocumento(doc)) {
      const bruto = no.nodeValue;
      const registro = { no, antes: /^\s*/.exec(bruto)[0], depois: /\s*$/.exec(bruto)[0] };
      textos.set(original, [...(textos.get(original) || []), registro]);
      if (!porElemento.has(el)) porElemento.set(el, original);
    }
    for (const { elemento: el, atributo, original } of atributosDoDocumento(doc)) {
      atributos.set(original, [...(atributos.get(original) || []), { elemento: el, atributo }]);
      if (!porElemento.has(el)) porElemento.set(el, original);
    }
    const primeiro = doc.querySelector(SELETOR_FAQ);
    modeloFaq = primeiro ? primeiro.cloneNode(true) : null;
    faqOriginal = [...doc.querySelectorAll(SELETOR_FAQ)].map((b) => ({
      pergunta: (b.querySelector(':scope > summary')?.textContent || '').replace(/\s+/g, ' ').trim(),
      resposta: [...b.querySelectorAll(':scope > p')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()).join('\n\n'),
    }));

    for (const original of new Set([...textos.keys(), ...atributos.keys()])) if (textoAtual(original) !== original) escrever(original);
    if (estado.trabalho.faq[caminho]) montarFaq();

    anexar(doc.head, h('style', null, '.cms-destaque{outline:3px solid #e8912a!important;outline-offset:3px!important;scroll-margin:8rem}'));
    doc.addEventListener('click', (evento) => {
      const alvo = evento.target;
      if (alvo.closest('a, button, form')) evento.preventDefault();
      let original = null;
      for (let el = alvo; el && el !== doc.body; el = el.parentElement) {
        if (porElemento.has(el)) { original = porElemento.get(el); break; }
      }
      if (!original) {
        for (const filho of alvo.querySelectorAll('*')) if (porElemento.has(filho)) { original = porElemento.get(filho); break; }
      }
      if (original && aoEscolher) aoEscolher(original);
    }, true);
    doc.addEventListener('submit', (evento) => evento.preventDefault(), true);
  });

  return {
    elemento,
    atualizar: escrever,
    atualizarFaq: montarFaq,
    destacar(original) {
      destacado?.classList.remove('cms-destaque');
      const alvo = textos.get(original)?.[0]?.no.parentElement || atributos.get(original)?.[0]?.elemento;
      destacado = alvo || null;
      if (!alvo) return;
      alvo.classList.add('cms-destaque');
      for (let pai = alvo.closest('details'); pai; pai = pai.parentElement?.closest('details')) pai.open = true;
      alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
  };
}
