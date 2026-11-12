// Funções usadas pelos dois lados: pelo painel (no navegador) e pelo Worker (na Cloudflare).
// Ficam num arquivo só para que a regra de comparação de textos seja exatamente a mesma nos dois.

export const SELETOR_FAQ = 'details.faq';

export const LIMITES = {
  texto: 6000,
  textos: 3000,
  titulo: 160,
  descricao: 400,
  faqItens: 40,
  pergunta: 300,
  resposta: 3000,
  llms: 30000,
  redirecionamentos: 200,
  perfis: 20,
  bytes: 400000,
  projetos: 24,
  projetoTitulo: 120,
  projetoDescricao: 400,
  midiaBytes: 10 * 1024 * 1024, // tamanho máximo de cada vídeo ou imagem enviado pelo painel
};

// Tipos de arquivo aceitos na biblioteca de mídia do painel.
export const TIPOS_DE_MIDIA = {
  'video/mp4': 'vídeo MP4',
  'video/webm': 'vídeo WebM',
  'image/jpeg': 'imagem JPG',
  'image/png': 'imagem PNG',
  'image/webp': 'imagem WebP',
};

// Onde a seção "outros projetos" aparece e o identificador dela na página (para links como /#projetos).
export const PAGINA_DOS_PROJETOS = '/';
export const ID_DOS_PROJETOS = 'projetos';

// Faixas recomendadas para os resultados de busca (em caracteres).
export const SEO = { tituloMin: 30, tituloMax: 60, descricaoMin: 110, descricaoMax: 160 };

/** Junta espaços e quebras de linha num espaço só. É a "chave" usada para achar um texto na página. */
export function normalizar(texto) {
  return String(texto ?? '').replace(/\s+/g, ' ').trim();
}

const ENTIDADES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™',
  middot: '·', bull: '•', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', ordm: 'º', ordf: 'ª',
  deg: '°', times: '×', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', sect: '§', euro: '€',
  aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', auml: 'ä', eacute: 'é', egrave: 'è', ecirc: 'ê',
  iacute: 'í', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', uacute: 'ú', uuml: 'ü', ccedil: 'ç', ntilde: 'ñ',
  Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Atilde: 'Ã', Eacute: 'É', Ecirc: 'Ê', Iacute: 'Í', Oacute: 'Ó',
  Ocirc: 'Ô', Otilde: 'Õ', Uacute: 'Ú', Ccedil: 'Ç',
};

/** Troca "&amp;", "&#39;", "&eacute;" etc. pelo caractere. O Worker recebe o HTML cru, com essas marcas. */
export function decodificarEntidades(texto) {
  if (!texto || texto.indexOf('&') === -1) return texto || '';
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (tudo, nome) => {
    if (nome[0] === '#') {
      const codigo = nome[1] === 'x' || nome[1] === 'X' ? parseInt(nome.slice(2), 16) : parseInt(nome.slice(1), 10);
      if (!Number.isFinite(codigo) || codigo <= 0 || codigo > 0x10ffff) return tudo;
      try { return String.fromCodePoint(codigo); } catch { return tudo; }
    }
    return Object.prototype.hasOwnProperty.call(ENTIDADES, nome) ? ENTIDADES[nome] : tudo;
  });
}

export function escaparHtml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** "/servicos/" e "/servicos.html" viram "/servicos"; a página inicial é "/". */
export function chavePagina(caminho) {
  let c = String(caminho || '/').split('?')[0].split('#')[0];
  try { c = decodeURI(c); } catch { /* mantém como veio */ }
  c = c.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
  if (c.length > 1) c = c.replace(/\/+$/, '');
  return c || '/';
}

export function conteudoVazio() {
  return { textos: {}, seo: {}, faq: {}, llms: null, perfis: [], redirecionamentos: [], projetos: null };
}

const CAMINHO_VALIDO = /^\/[^\s?#]*$/;
const CODIGOS_REDIRECIONAMENTO = [301, 302, 307, 308];

function ehObjeto(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

/**
 * Confere e limpa o conteúdo antes de gravar. Devolve { ok, erros, conteudo }.
 * O Worker sempre passa por aqui: nada que o painel mande é gravado sem esta conferência.
 */
export function validarConteudo(entrada) {
  const erros = [];
  const saida = conteudoVazio();
  if (!ehObjeto(entrada)) return { ok: false, erros: ['O conteúdo precisa ser um objeto.'], conteudo: saida };

  // Textos: { "texto original": "texto novo" }
  if (entrada.textos !== undefined) {
    if (!ehObjeto(entrada.textos)) erros.push('"textos" precisa ser um objeto.');
    else {
      const pares = Object.entries(entrada.textos);
      if (pares.length > LIMITES.textos) erros.push(`Há textos demais (máximo: ${LIMITES.textos}).`);
      for (const [original, novo] of pares.slice(0, LIMITES.textos)) {
        const chave = normalizar(original);
        if (!chave) continue;
        if (typeof novo !== 'string') { erros.push(`O texto novo de "${chave.slice(0, 40)}" precisa ser texto.`); continue; }
        if (chave.length > LIMITES.texto || novo.length > LIMITES.texto) { erros.push(`Texto longo demais: "${chave.slice(0, 40)}…".`); continue; }
        const limpo = normalizar(novo);
        if (limpo === chave) continue; // igual ao original: não há o que guardar
        saida.textos[chave] = limpo;
      }
    }
  }

  // SEO por página: { "/servicos": { titulo, descricao } }
  if (entrada.seo !== undefined) {
    if (!ehObjeto(entrada.seo)) erros.push('"seo" precisa ser um objeto.');
    else for (const [caminho, dados] of Object.entries(entrada.seo)) {
      if (!CAMINHO_VALIDO.test(caminho) || caminho.length > 200) { erros.push(`Endereço de página inválido em SEO: "${caminho}".`); continue; }
      if (!ehObjeto(dados)) { erros.push(`SEO de "${caminho}" precisa ser um objeto.`); continue; }
      const item = {};
      for (const [campo, limite] of [['titulo', LIMITES.titulo], ['descricao', LIMITES.descricao]]) {
        if (dados[campo] === undefined || dados[campo] === null) continue;
        if (typeof dados[campo] !== 'string') { erros.push(`SEO de "${caminho}": "${campo}" precisa ser texto.`); continue; }
        const valor = normalizar(dados[campo]);
        if (valor.length > limite) { erros.push(`SEO de "${caminho}": "${campo}" passou de ${limite} caracteres.`); continue; }
        if (valor) item[campo] = valor;
      }
      if (Object.keys(item).length) saida.seo[chavePagina(caminho)] = item;
    }
  }

  // Perguntas frequentes por página: { "/": [ { pergunta, resposta } ] }
  if (entrada.faq !== undefined) {
    if (!ehObjeto(entrada.faq)) erros.push('"faq" precisa ser um objeto.');
    else for (const [caminho, lista] of Object.entries(entrada.faq)) {
      if (!CAMINHO_VALIDO.test(caminho) || caminho.length > 200) { erros.push(`Endereço de página inválido em FAQ: "${caminho}".`); continue; }
      if (!Array.isArray(lista)) { erros.push(`FAQ de "${caminho}" precisa ser uma lista.`); continue; }
      if (lista.length === 0) { erros.push(`FAQ de "${caminho}": deixe pelo menos uma pergunta.`); continue; }
      if (lista.length > LIMITES.faqItens) { erros.push(`FAQ de "${caminho}": máximo de ${LIMITES.faqItens} perguntas.`); continue; }
      const itens = [];
      lista.forEach((item, i) => {
        const pergunta = normalizar(item?.pergunta);
        const resposta = String(item?.resposta ?? '').split(/\n\s*\n/).map(normalizar).filter(Boolean).join('\n\n');
        if (!pergunta || !resposta) erros.push(`FAQ de "${caminho}", item ${i + 1}: preencha a pergunta e a resposta.`);
        else if (pergunta.length > LIMITES.pergunta || resposta.length > LIMITES.resposta) erros.push(`FAQ de "${caminho}", item ${i + 1}: texto longo demais.`);
        else itens.push({ pergunta, resposta });
      });
      if (itens.length === lista.length) saida.faq[chavePagina(caminho)] = itens;
    }
  }

  // llms.txt (texto inteiro) ou null para manter o arquivo que veio com o site
  if (entrada.llms !== undefined && entrada.llms !== null) {
    if (typeof entrada.llms !== 'string') erros.push('"llms" precisa ser texto.');
    else if (entrada.llms.length > LIMITES.llms) erros.push(`O llms.txt passou de ${LIMITES.llms} caracteres.`);
    else if (entrada.llms.trim()) saida.llms = entrada.llms.replace(/\r\n/g, '\n').trim() + '\n';
  }

  // Perfis oficiais (vão para "sameAs" nos dados estruturados)
  if (entrada.perfis !== undefined) {
    if (!Array.isArray(entrada.perfis)) erros.push('"perfis" precisa ser uma lista.');
    else if (entrada.perfis.length > LIMITES.perfis) erros.push(`Máximo de ${LIMITES.perfis} perfis.`);
    else for (const bruto of entrada.perfis) {
      const endereco = String(bruto ?? '').trim();
      if (!endereco) continue;
      let ok = false;
      try { ok = new URL(endereco).protocol === 'https:'; } catch { ok = false; }
      if (!ok) erros.push(`Perfil inválido (use um endereço https://): "${endereco.slice(0, 60)}".`);
      else if (!saida.perfis.includes(endereco)) saida.perfis.push(endereco);
    }
  }

  // Redirecionamentos: [ { de, para, codigo } ]
  if (entrada.redirecionamentos !== undefined) {
    if (!Array.isArray(entrada.redirecionamentos)) erros.push('"redirecionamentos" precisa ser uma lista.');
    else if (entrada.redirecionamentos.length > LIMITES.redirecionamentos) erros.push(`Máximo de ${LIMITES.redirecionamentos} redirecionamentos.`);
    else {
      const vistos = new Set();
      entrada.redirecionamentos.forEach((item, i) => {
        const n = i + 1;
        const de = chavePagina(String(item?.de ?? '').trim());
        const para = String(item?.para ?? '').trim();
        const codigo = Number(item?.codigo ?? 301);
        if (!CAMINHO_VALIDO.test(String(item?.de ?? '').trim())) return erros.push(`Redirecionamento ${n}: "de" precisa começar com "/" e não pode ter "?" nem "#".`);
        if (de === '/admin' || de.startsWith('/admin/') || de.startsWith('/api/')) return erros.push(`Redirecionamento ${n}: não é permitido redirecionar o painel nem a API.`);
        let destinoOk = /^\/(?!\/)[^\s]*$/.test(para);
        if (!destinoOk) { try { destinoOk = new URL(para).protocol === 'https:'; } catch { destinoOk = false; } }
        if (!destinoOk) return erros.push(`Redirecionamento ${n}: "para" precisa ser um caminho ("/pagina") ou um endereço https://.`);
        if (!CODIGOS_REDIRECIONAMENTO.includes(codigo)) return erros.push(`Redirecionamento ${n}: código inválido (use 301 ou 302).`);
        if (para.startsWith('/') && chavePagina(para) === de) return erros.push(`Redirecionamento ${n}: origem e destino são iguais.`);
        if (vistos.has(de)) return erros.push(`Redirecionamento ${n}: "${de}" aparece duas vezes.`);
        vistos.add(de);
        saida.redirecionamentos.push({ de, para, codigo });
      });
      // Um destino não pode ser a origem de outro (evita voltas e cadeias)
      for (const r of saida.redirecionamentos) {
        if (r.para.startsWith('/') && vistos.has(chavePagina(r.para))) erros.push(`Redirecionamento em cadeia: "${r.de}" aponta para "${r.para}", que também é redirecionado.`);
      }
    }
  }

  // Seção "outros projetos" da página inicial: { titulo, texto, atalho, itens: [ { titulo, segmento, ano, descricao, video, capa } ] }
  if (entrada.projetos !== undefined && entrada.projetos !== null) {
    const p = entrada.projetos;
    if (!ehObjeto(p) || !Array.isArray(p.itens)) erros.push('"projetos" precisa ter uma lista de itens.');
    else if (p.itens.length > LIMITES.projetos) erros.push(`Máximo de ${LIMITES.projetos} projetos.`);
    else if (p.itens.length > 0) { // sem nenhum projeto, a seção simplesmente não existe
      const titulo = normalizar(p.titulo);
      const texto = normalizar(p.texto);
      const atalho = normalizar(p.atalho); // texto do botão no topo da página; vazio = sem botão
      if (!titulo) erros.push('Projetos: dê um título à seção.');
      if (titulo.length > LIMITES.projetoTitulo || texto.length > 600 || atalho.length > 60) erros.push('Projetos: título, texto de abertura ou texto do botão longo demais.');
      const itens = [];
      p.itens.forEach((item, i) => {
        const n = i + 1;
        const limpo = {
          titulo: normalizar(item?.titulo),
          segmento: normalizar(item?.segmento),
          ano: normalizar(item?.ano),
          descricao: normalizar(item?.descricao),
          video: String(item?.video ?? '').trim(),
          capa: String(item?.capa ?? '').trim(),
        };
        if (!limpo.titulo) return erros.push(`Projeto ${n}: falta o título.`);
        if (limpo.titulo.length > LIMITES.projetoTitulo || limpo.descricao.length > LIMITES.projetoDescricao || limpo.segmento.length > 60 || limpo.ano.length > 20) return erros.push(`Projeto ${n}: texto longo demais.`);
        for (const campo of ['video', 'capa']) {
          // Só arquivos do próprio site: da biblioteca do painel (/midia/...) ou já publicados com o site (/video/...).
          if (limpo[campo] && !/^\/(?!\/)[\w\-./%]+$/.test(limpo[campo])) return erros.push(`Projeto ${n}: o endereço do ${campo === 'video' ? 'vídeo' : 'arquivo de capa'} precisa ser um arquivo deste site (começando com "/").`);
        }
        if (!limpo.capa) return erros.push(`Projeto ${n}: falta a imagem de capa.`);
        itens.push(limpo);
      });
      if (itens.length === p.itens.length && titulo) saida.projetos = { titulo, texto, atalho, itens };
    }
  }

  let tamanho = 0;
  try { tamanho = new TextEncoder().encode(JSON.stringify(saida)).length; } catch { tamanho = Infinity; }
  if (tamanho > LIMITES.bytes) erros.push('O conteúdo ficou grande demais para ser gravado.');

  return { ok: erros.length === 0, erros, conteudo: saida };
}

/** Lista o que mudou entre dois conteúdos (por exemplo: publicado → rascunho). */
export function diferencas(antes, depois) {
  const a = { ...conteudoVazio(), ...(antes || {}) };
  const d = { ...conteudoVazio(), ...(depois || {}) };
  const lista = [];

  for (const chave of new Set([...Object.keys(a.textos), ...Object.keys(d.textos)])) {
    const de = a.textos[chave] ?? chave;
    const para = d.textos[chave] ?? chave;
    if (de !== para) lista.push({ tipo: 'texto', onde: chave, de, para });
  }
  for (const caminho of new Set([...Object.keys(a.seo), ...Object.keys(d.seo)])) {
    for (const campo of ['titulo', 'descricao']) {
      const de = a.seo[caminho]?.[campo] ?? null;
      const para = d.seo[caminho]?.[campo] ?? null;
      if (de !== para) lista.push({ tipo: 'seo', onde: caminho, campo, de, para });
    }
  }
  for (const caminho of new Set([...Object.keys(a.faq), ...Object.keys(d.faq)])) {
    const de = a.faq[caminho] ?? null;
    const para = d.faq[caminho] ?? null;
    if (JSON.stringify(de) !== JSON.stringify(para)) lista.push({ tipo: 'faq', onde: caminho, de, para });
  }
  if ((a.llms ?? null) !== (d.llms ?? null)) lista.push({ tipo: 'llms', onde: '/llms.txt', de: a.llms ?? null, para: d.llms ?? null });
  if (JSON.stringify(a.perfis) !== JSON.stringify(d.perfis)) lista.push({ tipo: 'perfis', onde: 'Perfis oficiais', de: a.perfis, para: d.perfis });
  if (JSON.stringify(a.projetos ?? null) !== JSON.stringify(d.projetos ?? null)) lista.push({ tipo: 'projetos', onde: 'Outros projetos', de: a.projetos ?? null, para: d.projetos ?? null });
  if (JSON.stringify(a.redirecionamentos) !== JSON.stringify(d.redirecionamentos)) {
    lista.push({ tipo: 'redirecionamentos', onde: 'Redirecionamentos', de: a.redirecionamentos, para: d.redirecionamentos });
  }
  return lista;
}

// Marca usada em textos sugeridos que descrevem a forma de trabalho da empresa e precisam de conferência.
export const MARCA_A_CONFIRMAR = '[CONFIRMAR]';

/** Quantos textos do conteúdo ainda trazem a marca [CONFIRMAR]. Com algum, o painel não deixa publicar. */
export function textosAConfirmar(conteudo) {
  let total = 0;
  JSON.stringify(conteudo || {}, (_, valor) => { if (typeof valor === 'string' && valor.includes(MARCA_A_CONFIRMAR)) total++; return valor; });
  return total;
}

/** Há alguma coisa a aplicar nas páginas? Se não houver, o Worker entrega o site como está. */
export function temAlteracoes(conteudo) {
  if (!conteudo) return false;
  return Boolean(
    Object.keys(conteudo.textos || {}).length || Object.keys(conteudo.seo || {}).length ||
    Object.keys(conteudo.faq || {}).length || conteudo.llms || (conteudo.perfis || []).length ||
    (conteudo.redirecionamentos || []).length || conteudo.projetos,
  );
}
