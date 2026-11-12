// Pequenas ajudas para montar a tela sem biblioteca externa.

/** Cria um elemento. Ex.: h('button', { class: 'botao', onclick: fn }, 'Salvar') */
export function h(nome, atributos, ...filhos) {
  const el = document.createElement(nome);
  for (const [chave, valor] of Object.entries(atributos || {})) {
    if (valor === false || valor === null || valor === undefined) continue;
    if (chave.startsWith('on') && typeof valor === 'function') el.addEventListener(chave.slice(2), valor);
    else if (chave === 'class') el.className = valor;
    else if (chave === 'dataset') Object.assign(el.dataset, valor);
    else if (chave === 'value' || chave === 'checked' || chave === 'disabled' || chave === 'selected' || chave === 'hidden') el[chave] = valor;
    else el.setAttribute(chave, valor === true ? '' : String(valor));
  }
  return anexar(el, ...filhos);
}

/** Como el.append(), mas aceita listas dentro de listas e ignora null, undefined e false. */
export function anexar(el, ...filhos) {
  for (const filho of filhos.flat(Infinity)) {
    if (filho === null || filho === undefined || filho === false) continue;
    el.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
  return el;
}

export function limpar(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function avisar(mensagem, tipo = 'ok') {
  const caixa = document.getElementById('avisos');
  const aviso = h('div', { class: `aviso aviso-${tipo}` }, mensagem);
  caixa.append(aviso);
  setTimeout(() => aviso.remove(), tipo === 'erro' ? 8000 : 4000);
}

/** Pergunta de confirmação. Devolve uma promessa com true (confirmou) ou false. */
export function confirmar(titulo, texto, rotuloSim = 'Confirmar') {
  return new Promise((resolver) => {
    const fechar = (resposta) => { dialogo.close(); dialogo.remove(); resolver(resposta); };
    const dialogo = h('dialog', { class: 'dialogo', 'aria-labelledby': 'dialogo-titulo' },
      h('h2', { id: 'dialogo-titulo' }, titulo),
      texto ? h('p', null, texto) : null,
      h('div', { class: 'dialogo-acoes' },
        h('button', { type: 'button', class: 'botao botao-contorno', onclick: () => fechar(false) }, 'Cancelar'),
        h('button', { type: 'button', class: 'botao botao-primario', onclick: () => fechar(true) }, rotuloSim),
      ),
    );
    dialogo.addEventListener('cancel', (e) => { e.preventDefault(); fechar(false); });
    document.body.append(dialogo);
    dialogo.showModal();
  });
}

export function formatarData(iso) {
  if (!iso) return 'nunca';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return 'data desconhecida';
  return data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function plural(n, um, varios) {
  return `${n} ${n === 1 ? um : varios}`;
}

/** Faz a caixa de texto crescer conforme o conteúdo. */
export function autoAltura(campo) {
  campo.addEventListener('input', () => ajustarAltura(campo));
  requestAnimationFrame(() => ajustarAltura(campo));
  return campo;
}

/** Recalcula a altura (use ao mostrar uma caixa que estava escondida). */
export function ajustarAltura(campo) {
  if (!campo.offsetParent) return; // escondida: a medida viria errada
  campo.style.height = 'auto';
  campo.style.height = `${campo.scrollHeight + 2}px`;
}

/** Nome amigável de uma página a partir do endereço. */
export function nomeDaPagina(caminho) {
  if (caminho === '/') return 'Página inicial';
  const nomes = { servicos: 'Serviços', portfolio: 'Portfólio', sobre: 'Sobre', contato: 'Contato', privacidade: 'Política de privacidade', obrigado: 'Mensagem enviada' };
  const ultimo = caminho.split('/').filter(Boolean).pop() || caminho;
  return nomes[ultimo] || ultimo.charAt(0).toUpperCase() + ultimo.slice(1).replace(/-/g, ' ');
}

export function baixarArquivo(nome, texto, tipo = 'application/json') {
  const link = h('a', { href: URL.createObjectURL(new Blob([texto], { type: tipo })), download: nome });
  document.body.append(link);
  link.click();
  setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
}
