// As verificações da auditoria. Tudo roda no navegador, lendo o site como um visitante o recebe.
// Cada verificação devolve: { categoria, titulo, estado, detalhe, comoResolver, pagina, link, noCodigo }
//   estado: 'ok' | 'aviso' | 'falha' | 'info'
//   noCodigo: true quando a correção depende de mexer no código do site (o painel não resolve sozinho)

import { SEO, SELETOR_FAQ, chavePagina, normalizar } from './comum.js';
import { analisarPagina, buscarTexto, descobrirPaginas, tiposDe, textosOriginaisDoSite } from './site.js';
import { nomeDaPagina, plural } from './dom.js';

export const CATEGORIAS = [
  { id: 'seo', nome: 'SEO', descricao: 'Como o Google e outros buscadores encontram e mostram o site.' },
  { id: 'ia', nome: 'IA: GEO e AEO', descricao: 'Como assistentes de IA e caixas de resposta entendem e citam o site.' },
  { id: 'tecnologia', nome: 'Tecnologia e segurança', descricao: 'Entrega das páginas, cabeçalhos de proteção e qualidade do HTML.' },
  { id: 'acessibilidade', nome: 'Acessibilidade', descricao: 'Uso por teclado, leitor de tela e pessoas com baixa visão.' },
  { id: 'conteudo', nome: 'Conteúdo e conversão', descricao: 'Se cada página explica o suficiente e leva ao contato.' },
];

const PESO = { ok: 1, aviso: 0.5, falha: 0 };

export function notas(resultados) {
  const porCategoria = {};
  for (const categoria of CATEGORIAS) {
    const itens = resultados.filter((r) => r.categoria === categoria.id && r.estado !== 'info');
    const soma = itens.reduce((s, r) => s + PESO[r.estado], 0);
    porCategoria[categoria.id] = {
      nota: itens.length ? Math.round((soma / itens.length) * 100) : null,
      ok: itens.filter((r) => r.estado === 'ok').length,
      aviso: itens.filter((r) => r.estado === 'aviso').length,
      falha: itens.filter((r) => r.estado === 'falha').length,
    };
  }
  const validas = Object.values(porCategoria).filter((c) => c.nota !== null);
  const geral = validas.length ? Math.round(validas.reduce((s, c) => s + c.nota, 0) / validas.length) : null;
  return { geral, porCategoria };
}

function editorDe(caminho, aba) {
  return `#/paginas/${encodeURIComponent(caminho)}${aba ? `/${aba}` : ''}`;
}

function verificarPagina(a, contexto) {
  const r = [];
  const nome = nomeDaPagina(a.caminho);
  const item = (categoria, titulo, estado, detalhe, extra = {}) => r.push({ categoria, titulo, estado, detalhe, pagina: a.caminho, ...extra });
  const doc = a.doc;

  // ——— SEO ———
  const t = a.titulo.length;
  if (!t) item('seo', `${nome}: sem título`, 'falha', 'A página não tem a marca <title>.', { link: editorDe(a.caminho, 'seo'), comoResolver: 'Escreva um título na aba "Busca e compartilhamento" da página.' });
  else if (t < SEO.tituloMin || t > SEO.tituloMax) {
    item('seo', `${nome}: título com ${t} caracteres`, 'aviso', `"${a.titulo}". O ideal fica entre ${SEO.tituloMin} e ${SEO.tituloMax}: ${t < SEO.tituloMin ? 'curto demais desperdiça espaço no resultado da busca' : 'longo demais é cortado pelo Google'}.`, { link: editorDe(a.caminho, 'seo'), comoResolver: 'Ajuste o título na aba "Busca e compartilhamento" da página.' });
  } else item('seo', `${nome}: título no tamanho certo`, 'ok', `"${a.titulo}" (${t} caracteres).`);

  const d = a.descricao.length;
  if (!d) item('seo', `${nome}: sem descrição`, 'falha', 'Sem a descrição, o Google escolhe um trecho qualquer da página.', { link: editorDe(a.caminho, 'seo'), comoResolver: 'Escreva a descrição na aba "Busca e compartilhamento".' });
  else if (d < SEO.descricaoMin || d > SEO.descricaoMax) {
    item('seo', `${nome}: descrição com ${d} caracteres`, 'aviso', `O ideal fica entre ${SEO.descricaoMin} e ${SEO.descricaoMax}. ${d < SEO.descricaoMin ? 'Há espaço para dizer mais sobre a página.' : 'O final será cortado no resultado da busca.'}`, { link: editorDe(a.caminho, 'seo'), comoResolver: 'Ajuste a descrição na aba "Busca e compartilhamento".' });
  } else item('seo', `${nome}: descrição no tamanho certo`, 'ok', `${d} caracteres.`);

  if (!a.canonica) item('seo', `${nome}: sem endereço oficial (canonical)`, 'falha', 'Sem essa marca, cópias da página em outros endereços podem competir com ela.', { noCodigo: true, comoResolver: 'Incluir <link rel="canonical"> no modelo da página.' });
  else {
    let certo = false;
    try { const u = new URL(a.canonica); certo = u.protocol === 'https:' && chavePagina(u.pathname) === a.caminho; } catch { certo = false; }
    item('seo', `${nome}: endereço oficial (canonical)`, certo ? 'ok' : 'aviso', certo ? a.canonica : `A marca aponta para "${a.canonica}", que não corresponde a esta página.`, certo ? {} : { noCodigo: true, comoResolver: 'Corrigir o endereço em <link rel="canonical">.' });
  }

  const h1 = a.titulos.filter((x) => x.nivel === 1);
  item('seo', `${nome}: título principal (H1)`, h1.length === 1 ? 'ok' : 'falha', h1.length === 1 ? `"${h1[0].texto}"` : `A página tem ${h1.length} títulos H1; o correto é exatamente um.`, h1.length === 1 ? {} : { noCodigo: true, comoResolver: 'Deixar um único <h1> por página.' });

  let anterior = 0;
  const saltos = [];
  for (const titulo of a.titulos) {
    if (anterior && titulo.nivel > anterior + 1) saltos.push(`H${anterior} → H${titulo.nivel} em "${titulo.texto.slice(0, 50)}"`);
    anterior = titulo.nivel;
  }
  item('seo', `${nome}: ordem dos títulos`, saltos.length ? 'aviso' : 'ok', saltos.length ? `Há saltos de nível: ${saltos.join('; ')}.` : `${a.titulos.length} títulos em ordem, sem pular níveis.`, saltos.length ? { noCodigo: true, comoResolver: 'Usar os níveis de título em sequência (H2 dentro de H1, H3 dentro de H2).' } : {});

  const faltaOg = ['titulo', 'descricao', 'imagem'].filter((c) => !a.og[c]);
  item('seo', `${nome}: cartão de compartilhamento`, faltaOg.length ? 'aviso' : 'ok', faltaOg.length ? `Faltam as marcas Open Graph: ${faltaOg.join(', ')}.` : 'Título, descrição e imagem definidos para WhatsApp, LinkedIn e outras redes.', faltaOg.length ? { noCodigo: true, comoResolver: 'Incluir as marcas og:title, og:description e og:image no modelo.' } : {});

  // ——— IA (GEO / AEO) ———
  if (a.jsonldErros.length) item('ia', `${nome}: dados estruturados com erro`, 'falha', a.jsonldErros.join(' '), { noCodigo: true, comoResolver: 'Corrigir o JSON-LD da página.' });
  else if (!a.jsonld.length) item('ia', `${nome}: sem dados estruturados`, 'aviso', 'A página não descreve seu conteúdo em JSON-LD.', { noCodigo: true, comoResolver: 'Incluir dados estruturados (schema.org) no modelo.' });
  else item('ia', `${nome}: dados estruturados válidos`, 'ok', `Tipos: ${[...new Set(a.jsonld.flatMap(tiposDe))].join(', ')}.`);

  if (a.faq) {
    const noLd = a.jsonld.find((n) => tiposDe(n).includes('FAQPage'))?.mainEntity || [];
    const iguais = noLd.length === a.faq.length && a.faq.every((f, i) => normalizar(noLd[i]?.name) === f.pergunta);
    item('ia', `${nome}: perguntas da página e dos dados estruturados`, iguais ? 'ok' : 'falha', iguais ? `${a.faq.length} perguntas, iguais nos dois lugares.` : `A página mostra ${a.faq.length} perguntas e os dados estruturados trazem ${noLd.length}. Os dois precisam ser iguais.`, iguais ? {} : { link: '#/faq', comoResolver: 'Edite as perguntas pela tela "Perguntas frequentes": ela atualiza os dois lugares juntos.' });
    item('ia', `${nome}: quantidade de perguntas frequentes`, a.faq.length >= 6 ? 'ok' : 'aviso', a.faq.length >= 6 ? `${a.faq.length} perguntas.` : `Só ${plural(a.faq.length, 'pergunta', 'perguntas')}. Cada pergunta real de cliente é uma chance a mais de a página ser citada por assistentes de IA e pelo Google.`, a.faq.length >= 6 ? {} : { link: '#/faq', comoResolver: 'Acrescente perguntas que os clientes fazem de fato (prazo, etapas, documentos, custo do INPI, sigilo).' });
    const curtas = a.faq.filter((f) => f.resposta.length < 80).length;
    const longas = a.faq.filter((f) => f.resposta.length > 600).length;
    item('ia', `${nome}: tamanho das respostas`, curtas || longas ? 'aviso' : 'ok', curtas || longas ? `${curtas ? `${plural(curtas, 'resposta tem', 'respostas têm')} menos de 80 caracteres (não informa o suficiente para ser citada). ` : ''}${longas ? `${plural(longas, 'resposta passa', 'respostas passam')} de 600 caracteres.` : ''}` : 'Todas as respostas têm entre 80 e 600 caracteres.', curtas || longas ? { link: '#/faq', comoResolver: 'Responda na primeira frase e complete com um ou dois fatos concretos.' } : {});
  }

  if (a.caminho !== '/' && a.status === 200) {
    const temTrilha = a.jsonld.some((n) => tiposDe(n).includes('BreadcrumbList'));
    item('ia', `${nome}: trilha de navegação nos dados estruturados`, temTrilha ? 'ok' : 'aviso', temTrilha ? 'BreadcrumbList presente.' : 'Sem BreadcrumbList. Ela ajuda buscadores e assistentes a entender onde a página fica dentro do site.', temTrilha ? {} : { noCodigo: true, comoResolver: 'Incluir BreadcrumbList (Início › página) no JSON-LD das páginas internas.' });
  }

  // ——— Tecnologia ———
  if (a.sobraAposHtml) item('tecnologia', `${nome}: código depois do fim do HTML`, 'aviso', `Há ${a.sobraAposHtml} caracteres depois de </html> (um <script> ficou fora da página). Os navegadores toleram, mas o HTML é inválido.`, { noCodigo: true, comoResolver: 'No Astro, mover o <script> da página para dentro do layout (antes de </body>).' });
  else item('tecnologia', `${nome}: HTML termina corretamente`, 'ok', 'Nada depois de </html>.');

  item('tecnologia', `${nome}: peso do HTML`, a.bytes > 150000 ? 'aviso' : 'ok', `${(a.bytes / 1024).toFixed(1)} KB.`);

  const imagens = [...doc.querySelectorAll('img')];
  const semMedidas = imagens.filter((i) => !i.getAttribute('width') || !i.getAttribute('height'));
  if (imagens.length) item('tecnologia', `${nome}: imagens com largura e altura`, semMedidas.length ? 'aviso' : 'ok', semMedidas.length ? `${plural(semMedidas.length, 'imagem', 'imagens')} sem width/height: a página "pula" enquanto carrega.` : `${plural(imagens.length, 'imagem', 'imagens')} com medidas declaradas.`, semMedidas.length ? { noCodigo: true, comoResolver: 'Declarar width e height em todas as <img>.' } : {});
  const antigas = imagens.filter((i) => /\.(jpe?g|png)(\?|$)/i.test(i.getAttribute('src') || '') && Number(i.getAttribute('width')) >= 600);
  if (antigas.length) item('tecnologia', `${nome}: formato das imagens grandes`, 'info', `${plural(antigas.length, 'imagem grande está', 'imagens grandes estão')} em JPG/PNG, sem versão AVIF ou WebP nem tamanhos alternativos (srcset).`, { noCodigo: true, comoResolver: 'Usar o componente <Image> do Astro para gerar AVIF/WebP e srcset. Economia estimada: 60 a 90 KB por página.' });

  for (const video of doc.querySelectorAll('video')) {
    if (!video.querySelector('track')) item('tecnologia', `${nome}: vídeo sem faixa de legenda`, 'info', 'Se o vídeo tiver narração ou texto falado, ele precisa de legendas (<track kind="captions">). Se for só imagem, não é necessário.', { noCodigo: true });
  }

  // ——— Acessibilidade ———
  item('acessibilidade', `${nome}: idioma declarado`, a.idioma ? 'ok' : 'falha', a.idioma ? `lang="${a.idioma}".` : 'Falta o atributo lang em <html>; leitores de tela não sabem em que idioma ler.', a.idioma ? {} : { noCodigo: true });
  const semAlt = imagens.filter((i) => !i.hasAttribute('alt'));
  if (imagens.length) item('acessibilidade', `${nome}: descrição das imagens`, semAlt.length ? 'falha' : 'ok', semAlt.length ? `${plural(semAlt.length, 'imagem', 'imagens')} sem o atributo alt.` : `Todas as ${imagens.length} imagens têm texto alternativo.`, semAlt.length ? { noCodigo: true, comoResolver: 'Incluir alt em todas as imagens (alt="" nas decorativas).' } : {});

  const controles = [...doc.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea')];
  const semRotulo = controles.filter((c) => !(c.id && doc.querySelector(`label[for="${CSS.escape(c.id)}"]`)) && !c.closest('label') && !c.getAttribute('aria-label') && !c.getAttribute('aria-labelledby'));
  if (controles.length) item('acessibilidade', `${nome}: campos de formulário com rótulo`, semRotulo.length ? 'falha' : 'ok', semRotulo.length ? `${plural(semRotulo.length, 'campo', 'campos')} sem rótulo associado.` : `${plural(controles.length, 'campo', 'campos')}, todos com rótulo.`, semRotulo.length ? { noCodigo: true } : {});

  const semNome = [...doc.querySelectorAll('a[href], button')].filter((e) => !normalizar(e.textContent) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.querySelector('img[alt]:not([alt=""])'));
  item('acessibilidade', `${nome}: links e botões com nome`, semNome.length ? 'falha' : 'ok', semNome.length ? `${plural(semNome.length, 'link ou botão', 'links ou botões')} sem texto nem rótulo.` : 'Todos os links e botões têm nome legível.', semNome.length ? { noCodigo: true } : {});

  const genericos = [...doc.querySelectorAll('a[href]')].filter((e) => /^(clique aqui|aqui|saiba mais|leia mais|ver mais|link)$/i.test(normalizar(e.textContent)));
  item('acessibilidade', `${nome}: texto dos links`, genericos.length ? 'aviso' : 'ok', genericos.length ? `${plural(genericos.length, 'link usa', 'links usam')} texto genérico ("${normalizar(genericos[0].textContent)}"), que não diz para onde leva.` : 'Os links dizem para onde levam.', genericos.length ? { link: editorDe(a.caminho), comoResolver: 'Troque por um texto que descreva o destino.' } : {});

  const pular = doc.querySelector('a[href^="#"]');
  const alvo = pular && doc.getElementById(pular.getAttribute('href').slice(1));
  item('acessibilidade', `${nome}: atalho "pular para o conteúdo"`, pular && alvo ? 'ok' : 'aviso', pular && alvo ? `"${normalizar(pular.textContent)}" leva a #${alvo.id}.` : 'Não encontrei um link de atalho para o conteúdo principal no início da página.', pular && alvo ? {} : { noCodigo: true });

  const ids = [...doc.querySelectorAll('[id]')].map((e) => e.id);
  const repetidos = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  item('acessibilidade', `${nome}: identificadores únicos`, repetidos.length ? 'aviso' : 'ok', repetidos.length ? `Identificadores repetidos: ${repetidos.slice(0, 5).join(', ')}.` : 'Nenhum id repetido.', repetidos.length ? { noCodigo: true } : {});

  const novaAba = [...doc.querySelectorAll('a[target="_blank"]')].filter((e) => !/noopener/.test(e.getAttribute('rel') || ''));
  if (doc.querySelector('a[target="_blank"]')) item('tecnologia', `${nome}: links que abrem em nova aba`, novaAba.length ? 'aviso' : 'ok', novaAba.length ? `${plural(novaAba.length, 'link', 'links')} sem rel="noopener".` : 'Todos com rel="noopener".', novaAba.length ? { noCodigo: true } : {});

  // ——— Conteúdo ———
  const paginaDeApoio = /contato|obrigado|privacidade/.test(a.caminho);
  if (!paginaDeApoio) item('conteudo', `${nome}: volume de texto`, a.palavras < 300 ? 'aviso' : 'ok', a.palavras < 300 ? `${a.palavras} palavras. É pouco para explicar o assunto a quem chega pela busca e para assistentes de IA terem o que citar.` : `${a.palavras} palavras.`, a.palavras < 300 ? { link: editorDe(a.caminho), comoResolver: 'Aprofunde: para quem é, o que é entregue, como funciona, prazos típicos e exemplos.' } : {});
  if (a.caminho !== '/contato' && !/obrigado/.test(a.caminho)) {
    const temContato = Boolean(doc.querySelector('main a[href="/contato"], main a[href^="mailto:"]'));
    item('conteudo', `${nome}: caminho para o contato`, temContato ? 'ok' : 'aviso', temContato ? 'A página tem chamada para o contato no conteúdo.' : 'O conteúdo da página não tem link para o contato; o visitante depende do menu.', temContato ? {} : { noCodigo: true });
  }
  const genericosServico = [...doc.querySelectorAll('main article a[href], main li a[href]')].filter((e) => contexto.caminhos.includes(chavePagina(e.getAttribute('href').split('#')[0])) && !e.getAttribute('href').includes('#'));
  const destinos = new Map();
  for (const link of genericosServico) { const k = link.getAttribute('href'); destinos.set(k, (destinos.get(k) || 0) + 1); }
  const repetidosDestino = [...destinos.entries()].filter(([, n]) => n >= 3);
  if (repetidosDestino.length) item('conteudo', `${nome}: vários cartões levam ao mesmo lugar`, 'aviso', `${repetidosDestino.map(([k, n]) => `${n} links diferentes apontam para "${k}"`).join('; ')}, sem levar à seção correspondente.`, { noCodigo: true, comoResolver: 'Dar um endereço próprio a cada item (âncora como /servicos#propriedade-industrial ou, melhor, uma página por serviço).' });

  return r;
}

export async function rodarAuditoria(aoProgredir = () => {}) {
  const resultados = [];
  const item = (categoria, titulo, estado, detalhe, extra = {}) => resultados.push({ categoria, titulo, estado, detalhe, ...extra });

  aoProgredir('Descobrindo as páginas…');
  const { caminhos, fonte, noSitemap } = await descobrirPaginas();
  aoProgredir(`Lendo ${caminhos.length} páginas…`);
  const analises = (await Promise.all(caminhos.map((c) => analisarPagina(c, 'publicado').catch(() => null)))).filter(Boolean);
  const contexto = { caminhos };
  for (const analise of analises) {
    if (analise.status !== 200) { item('seo', `${nomeDaPagina(analise.caminho)}: página fora do ar`, 'falha', `Está no sitemap, mas respondeu ${analise.status}.`, { pagina: analise.caminho }); continue; }
    resultados.push(...verificarPagina(analise, contexto));
  }
  const noAr = analises.filter((a) => a.status === 200);
  const inicio = noAr.find((a) => a.caminho === '/');

  // ——— Verificações do site inteiro ———
  aoProgredir('Conferindo robots.txt, sitemap, llms.txt e links…');
  const [robots, llms, inexistente] = await Promise.all([
    buscarTexto('/robots.txt'), buscarTexto('/llms.txt'), buscarTexto(`/pagina-que-nao-existe-${Date.now()}`),
  ]);

  // Indexação
  const bloqueadas = noAr.filter((a) => /noindex/i.test(a.cabecalhos['x-robots-tag'] || '') || /noindex/i.test(a.robots));
  const hostOficial = (() => { try { return new URL(inicio?.canonica || '').host; } catch { return ''; } })();
  if (bloqueadas.length) {
    const provisorio = hostOficial && hostOficial !== location.host;
    item('seo', 'Indexação: este endereço pede para não aparecer nos buscadores', provisorio ? 'aviso' : 'falha',
      `${bloqueadas.length} de ${noAr.length} páginas são entregues com "noindex" em ${location.host}. ${provisorio ? `Isso é correto enquanto este for um endereço provisório: o endereço oficial declarado é ${hostOficial}. Confirme que, em ${hostOficial}, o cabeçalho X-Robots-Tag: noindex NÃO é enviado; se for, o site inteiro fica invisível no Google.` : 'Nenhuma página pode aparecer no Google enquanto isso estiver ativo.'}`,
      { noCodigo: true, comoResolver: 'Enviar "X-Robots-Tag: noindex" somente no endereço *.workers.dev; no domínio oficial, não enviar. Depois, cadastrar o domínio no Google Search Console e enviar o sitemap.' });
  } else item('seo', 'Indexação liberada', 'ok', 'Nenhuma página pede para ficar fora dos buscadores.');

  // Títulos e descrições repetidos
  for (const [campo, rotulo] of [['titulo', 'Títulos'], ['descricao', 'Descrições']]) {
    const mapa = new Map();
    for (const a of noAr) if (a[campo]) mapa.set(a[campo], [...(mapa.get(a[campo]) || []), a.caminho]);
    const repetidos = [...mapa.values()].filter((l) => l.length > 1);
    item('seo', `${rotulo} únicos entre as páginas`, repetidos.length ? 'aviso' : 'ok', repetidos.length ? `Repetidos em: ${repetidos.map((l) => l.join(' e ')).join('; ')}.` : `Cada página tem ${campo === 'titulo' ? 'seu próprio título' : 'sua própria descrição'}.`, repetidos.length ? { link: '#/paginas', comoResolver: 'Dê a cada página um texto próprio.' } : {});
  }

  // Sitemap e robots
  item('seo', 'Mapa do site (sitemap)', fonte === 'sitemap' ? 'ok' : 'falha', fonte === 'sitemap' ? `${noSitemap.length} endereços listados.` : 'Não encontrei /sitemap-index.xml nem /sitemap.xml.', fonte === 'sitemap' ? {} : { noCodigo: true, comoResolver: 'Ativar a integração @astrojs/sitemap.' });
  if (robots.status !== 200) item('seo', 'robots.txt', 'falha', 'O arquivo /robots.txt não existe.', { noCodigo: true });
  else {
    const temSitemap = /^sitemap:/im.test(robots.texto);
    const bloqueiaTudo = /^disallow:\s*\/\s*$/im.test(robots.texto);
    item('seo', 'robots.txt', bloqueiaTudo ? 'falha' : temSitemap ? 'ok' : 'aviso', bloqueiaTudo ? 'O arquivo bloqueia o site inteiro (Disallow: /).' : temSitemap ? 'Libera o site e indica o sitemap.' : 'Não indica o endereço do sitemap.', bloqueiaTudo || !temSitemap ? { noCodigo: true } : {});
    const bloqueiaApi = /^disallow:\s*\/api\//im.test(robots.texto);
    item('seo', 'robots.txt: área do painel', bloqueiaApi ? 'ok' : 'info', bloqueiaApi ? '/admin/ e /api/ fora do rastreamento.' : 'O arquivo já afasta os robôs de /admin/. Vale acrescentar "Disallow: /api/" (o painel já envia noindex nesses endereços, então é só um reforço).', bloqueiaApi ? {} : { noCodigo: true });
    const robosIa = ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot'];
    const barrados = robosIa.filter((nome) => new RegExp(`user-agent:\\s*${nome}[\\s\\S]*?disallow:\\s*/\\s*$`, 'im').test(robots.texto));
    item('ia', 'Robôs de IA no robots.txt', barrados.length ? 'aviso' : 'ok', barrados.length ? `Bloqueados: ${barrados.join(', ')}. Esses assistentes não poderão ler nem citar o site.` : 'Nenhum robô de assistente de IA está bloqueado: o site pode ser lido e citado.', barrados.length ? { noCodigo: true } : {});
  }

  item('seo', 'Página de erro (404)', inexistente.status === 404 ? 'ok' : 'falha', inexistente.status === 404 ? 'Endereços inexistentes respondem 404, como deve ser.' : `Um endereço inexistente respondeu ${inexistente.status}; o Google pode indexar páginas vazias.`, inexistente.status === 404 ? {} : { noCodigo: true });

  // Links internos
  const links = new Set();
  for (const a of noAr) for (const link of a.doc.querySelectorAll('a[href], img[src], link[rel="stylesheet"][href]')) {
    const bruto = link.getAttribute('href') || link.getAttribute('src');
    try {
      const u = new URL(bruto, location.origin + a.caminho);
      if (u.origin === location.origin && !/\.mp4$/i.test(u.pathname) && !u.pathname.startsWith('/admin')) links.add(u.pathname);
    } catch { /* endereço inválido */ }
  }
  const lista = [...links].slice(0, 80);
  const estados = await Promise.all(lista.map(async (caminho) => {
    try { return [caminho, (await fetch(caminho, { method: 'HEAD', cache: 'no-store' })).status]; } catch { return [caminho, 0]; }
  }));
  const quebrados = estados.filter(([, s]) => s !== 200);
  item('seo', 'Links e arquivos internos', quebrados.length ? 'falha' : 'ok', quebrados.length ? `Não abrem: ${quebrados.map(([c, s]) => `${c} (${s || 'sem resposta'})`).join(', ')}.` : `${lista.length} endereços internos conferidos, todos no ar.`, quebrados.length ? { noCodigo: true } : {});

  // ——— IA: llms.txt, organização, autoria ———
  if (llms.status !== 200) item('ia', 'llms.txt', 'aviso', 'O site não tem /llms.txt, o resumo que assistentes de IA usam para entender a empresa.', { link: '#/ia', comoResolver: 'Gere o arquivo pela tela "IA e buscadores".' });
  else {
    const temTitulo = /^#\s+\S/m.test(llms.texto);
    const temResumo = /^>\s+\S/m.test(llms.texto);
    const faltam = caminhos.filter((c) => !/obrigado/.test(c) && !llms.texto.includes(c === '/' ? `${hostOficial || location.host}/)` : `${c})`));
    item('ia', 'llms.txt: estrutura', temTitulo && temResumo ? 'ok' : 'aviso', temTitulo && temResumo ? `Título e resumo presentes (${llms.texto.length} caracteres).` : 'O arquivo precisa começar com "# Nome" e trazer um resumo em uma linha iniciada por ">".', temTitulo && temResumo ? {} : { link: '#/ia' });
    item('ia', 'llms.txt: páginas listadas', faltam.length ? 'aviso' : 'ok', faltam.length ? `Faltam: ${faltam.join(', ')}.` : 'Todas as páginas do sitemap estão no arquivo.', faltam.length ? { link: '#/ia', comoResolver: 'Use "Gerar a partir do site" e revise.' } : {});
  }

  const organizacao = inicio?.jsonld.find((n) => tiposDe(n).some((t) => /Organization|LocalBusiness|ProfessionalService/.test(t)));
  if (!organizacao) item('ia', 'Dados da empresa (Organization)', 'falha', 'A página inicial não descreve a empresa em dados estruturados.', { noCodigo: true });
  else {
    item('ia', 'Dados da empresa (Organization)', 'ok', `${organizacao.name || ''}${organizacao.taxID ? `, CNPJ ${organizacao.taxID}` : ''}${organizacao.address?.addressLocality ? `, ${organizacao.address.addressLocality}` : ''}.`);
    const perfis = Array.isArray(organizacao.sameAs) ? organizacao.sameAs : organizacao.sameAs ? [organizacao.sameAs] : [];
    item('ia', 'Perfis oficiais da empresa (sameAs)', perfis.length ? 'ok' : 'aviso', perfis.length ? perfis.join(', ') : 'Nenhum perfil oficial (LinkedIn, cadastro no INPI, CREA, Google Perfil da Empresa) está ligado à empresa. Sem isso, buscadores e assistentes têm menos como confirmar que a KAS-Trom é quem diz ser.', perfis.length ? {} : { link: '#/ia', comoResolver: 'Cadastre os endereços na tela "IA e buscadores".' });
  }
  const temPessoa = noAr.some((a) => a.jsonld.some((n) => tiposDe(n).includes('Person') || n.founder || n.employee || n.author));
  item('ia', 'Responsável técnico identificado', temPessoa ? 'ok' : 'aviso', temPessoa ? 'Há uma pessoa identificada nos dados estruturados.' : 'Nenhuma página diz quem é o responsável técnico (nome, formação, registro profissional). Em engenharia e patentes, quem assina é o principal sinal de confiança, para pessoas e para assistentes de IA.', temPessoa ? {} : { noCodigo: true, comoResolver: 'Incluir na página "Sobre" o nome, a formação e o registro profissional do responsável, com dados estruturados do tipo Person.' });

  const comData = noAr.filter((a) => a.jsonld.some((n) => n.dateModified)).length;
  item('ia', 'Data de atualização das páginas', comData === noAr.length ? 'ok' : 'aviso', `${comData} de ${noAr.length} páginas informam quando foram atualizadas (dateModified).`, comData === noAr.length ? {} : { noCodigo: true });

  const perguntas = noAr.flatMap((a) => a.titulos.filter((t) => t.texto.endsWith('?')).map((t) => t.texto));
  const totalFaq = noAr.reduce((s, a) => s + (a.faq?.length || 0), 0);
  item('ia', 'Conteúdo em formato de pergunta e resposta', perguntas.length + totalFaq >= 10 ? 'ok' : 'aviso', `${totalFaq} perguntas frequentes e ${perguntas.length} títulos em forma de pergunta no site inteiro. Assistentes de IA respondem perguntas; páginas que já trazem a pergunta e a resposta direta são as mais citadas.`, perguntas.length + totalFaq >= 10 ? {} : { link: '#/faq', comoResolver: 'Amplie as perguntas frequentes e considere artigos-guia (por exemplo: "Quanto custa registrar uma patente no INPI?").' });
  const comFaq = noAr.filter((a) => a.faq).map((a) => a.caminho);
  const semFaq = noAr.filter((a) => !a.faq && /servic/.test(a.caminho));
  if (semFaq.length) item('ia', 'Perguntas frequentes só na página inicial', 'aviso', `A página de serviços não tem bloco de perguntas (hoje ele existe em: ${comFaq.join(', ') || 'nenhuma página'}). É nela que surgem as dúvidas sobre escopo, prazo e entrega.`, { noCodigo: true, comoResolver: `Incluir no modelo da página um bloco de perguntas com a mesma marcação (${SELETOR_FAQ}); depois disso o painel passa a editá-lo.` });

  // ——— Tecnologia e segurança ———
  const cab = inicio?.cabecalhos || {};
  item('tecnologia', 'Conexão segura (HTTPS e HSTS)', location.protocol === 'https:' && cab['strict-transport-security'] ? 'ok' : location.hostname === 'localhost' ? 'info' : 'aviso', cab['strict-transport-security'] ? `HSTS: ${cab['strict-transport-security']}.` : 'O cabeçalho Strict-Transport-Security não foi encontrado.');
  const csp = cab['content-security-policy'] || '';
  item('tecnologia', 'Política de segurança de conteúdo (CSP)', csp ? 'ok' : 'aviso', csp ? 'O site limita de onde scripts, imagens e formulários podem vir.' : 'Sem Content-Security-Policy.', csp ? {} : { noCodigo: true });
  if (/script-src[^;]*'unsafe-inline'/.test(csp)) item('tecnologia', 'CSP permite scripts embutidos', 'info', 'A regra script-src inclui \'unsafe-inline\', necessária porque o Astro embute pequenos scripts na página. É possível trocar por hashes para uma proteção mais forte.', { noCodigo: true });
  for (const [nome, rotulo] of [['x-content-type-options', 'Proteção contra troca de tipo de arquivo'], ['referrer-policy', 'Política de referência'], ['permissions-policy', 'Política de permissões do navegador']]) {
    item('tecnologia', rotulo, cab[nome] ? 'ok' : 'aviso', cab[nome] ? `${nome}: ${cab[nome]}` : `Cabeçalho ${nome} ausente.`, cab[nome] ? {} : { noCodigo: true });
  }
  const moldura = /frame-ancestors/.test(csp) || cab['x-frame-options'];
  item('tecnologia', 'Proteção contra exibição em molduras de outros sites', moldura ? 'ok' : 'aviso', moldura ? 'O site não pode ser embutido em páginas de terceiros.' : 'Sem X-Frame-Options nem frame-ancestors.', moldura ? {} : { noCodigo: true });
  const videos = noAr.flatMap((a) => [...a.doc.querySelectorAll('video[src], video source[src]')].map((v) => v.getAttribute('src')));
  if (videos.length) item('tecnologia', 'Entrega do vídeo', 'info', 'O Worker carrega o arquivo de vídeo inteiro na memória a cada pedido de trecho (cada vez que o visitante avança o vídeo). Funciona, mas gasta tempo de processamento e atrasa o avanço em conexões lentas.', { noCodigo: true, comoResolver: 'Hospedar o vídeo no Cloudflare R2 ou no Cloudflare Stream, que entregam trechos nativamente.' });
  item('tecnologia', 'Medição de visitas', 'info', 'O site não tem nenhuma ferramenta de medição (decisão declarada na política de privacidade). Sem dados, não dá para saber quais páginas e buscas trazem contatos.', { noCodigo: true, comoResolver: 'O Cloudflare Web Analytics mede visitas sem cookies e sem identificar pessoas; e o Google Search Console mostra as buscas, sem instalar nada no site.' });

  // ——— Conteúdo ———
  const privacidade = noAr.find((a) => /privacidade/.test(a.caminho));
  if (privacidade) {
    const texto = normalizar(privacidade.doc.querySelector('main')?.textContent);
    item('conteudo', 'Política de privacidade: data de atualização', /última atualização/i.test(texto) ? 'ok' : 'aviso', /última atualização/i.test(texto) ? 'A política informa quando foi atualizada.' : 'A política não informa a data da última atualização.');
    const temBase = /base legal|legítimo interesse|consentimento/i.test(texto);
    const temPrazo = /prazo|por quanto tempo|período de|guardamos por|mantemos por/i.test(texto);
    item('conteudo', 'Política de privacidade: base legal e prazo de guarda', temBase && temPrazo ? 'ok' : 'aviso', temBase && temPrazo ? 'Informa a base legal e o prazo de guarda dos dados.' : `A LGPD pede que a política diga ${[!temBase && 'com que base legal os dados são tratados', !temPrazo && 'por quanto tempo ficam guardados'].filter(Boolean).join(' e ')}.`, temBase && temPrazo ? {} : { link: editorDe(privacidade.caminho), comoResolver: 'Acrescente as duas informações ao texto (vale confirmar a redação com quem cuida do jurídico).' });
  }
  const contato = noAr.find((a) => a.caminho === '/contato');
  if (contato) {
    const texto = normalizar(contato.doc.querySelector('main')?.textContent);
    const temPrazo = /\d+\s*(dia|hora)|dias úteis|até\s+\d+/i.test(texto);
    item('conteudo', 'Contato: prazo de resposta', temPrazo ? 'ok' : 'aviso', temPrazo ? 'A página diz em quanto tempo a empresa responde.' : 'A página diz "Respondemos por e-mail", mas não em quanto tempo. Dizer o prazo (por exemplo, "em até 2 dias úteis") reduz a hesitação de quem vai escrever.', temPrazo ? {} : { link: editorDe('/contato'), comoResolver: 'Edite o texto de abertura e o passo 2 da página de contato.' });
  }

  // Edições do painel que não encontram mais o texto de origem
  try {
    const { estado } = await import('./estado.js');
    const editados = Object.keys(estado.publicado?.conteudo?.textos || {});
    if (editados.length) {
      const existentes = await textosOriginaisDoSite();
      const orfaos = editados.filter((t) => !existentes.has(t));
      item('conteudo', 'Edições do painel aplicadas', orfaos.length ? 'aviso' : 'ok', orfaos.length ? `${plural(orfaos.length, 'edição não encontra', 'edições não encontram')} mais o texto de origem (o site foi reconstruído com outro texto): "${orfaos[0].slice(0, 60)}…".` : `${plural(editados.length, 'texto editado', 'textos editados')}, todos encontrados nas páginas.`, orfaos.length ? { link: '#/publicacao', comoResolver: 'Reveja essas edições na tela "Publicação".' } : {});
    }
  } catch { /* sem estado carregado: ignora esta verificação */ }

  return { em: new Date().toISOString(), host: location.host, paginas: noAr.length, resultados };
}

const CHAVE = 'kastrom-cms-auditoria';
export function guardarAuditoria(auditoria) {
  try { sessionStorage.setItem(CHAVE, JSON.stringify(auditoria)); } catch { /* sem espaço: segue sem guardar */ }
}
export function auditoriaGuardada() {
  try { return JSON.parse(sessionStorage.getItem(CHAVE)); } catch { return null; }
}
