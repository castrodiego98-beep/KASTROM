// Testes da API do painel e da camada de edição, contra o Worker rodando de verdade (wrangler dev).

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const midia = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'midia');

export async function testarApi(base, senha, relatar) {
  let cookie = '';
  const pedir = async (caminho, { metodo = 'GET', corpo, origem = base, tipo = 'application/json', semCookie = false, redirect = 'manual' } = {}) => {
    const cabecalhos = {};
    if (cookie && !semCookie) cabecalhos.Cookie = cookie;
    if (metodo !== 'GET') { if (origem) cabecalhos.Origin = origem; if (tipo) cabecalhos['Content-Type'] = tipo; }
    const r = await fetch(base + caminho, { method: metodo, headers: cabecalhos, body: corpo === undefined ? undefined : JSON.stringify(corpo), redirect });
    const texto = await r.text();
    let dados = null;
    try { dados = JSON.parse(texto); } catch { /* não é JSON */ }
    return { status: r.status, cabecalhos: r.headers, texto, dados };
  };
  const teste = async (nome, fn) => { await fn(); relatar(nome); };

  const originalInicio = (await pedir('/')).texto;
  const originalLlms = (await pedir('/llms.txt')).texto;

  await teste('sem sessão: a API recusa leitura e gravação', async () => {
    assert.equal((await pedir('/api/cms/conteudo')).status, 401);
    assert.equal((await pedir('/api/cms/rascunho', { metodo: 'PUT', corpo: { rev: 0, conteudo: {} } })).status, 401);
    assert.equal((await pedir('/api/cms/publicar', { metodo: 'POST', corpo: {} })).status, 401);
  });

  await teste('sem sessão: "?cms=rascunho" e "?cms=original" não mudam nada nem liberam moldura', async () => {
    const r = await pedir('/?cms=rascunho');
    assert.equal(r.cabecalhos.get('x-frame-options'), 'DENY');
    assert.equal(r.texto, originalInicio);
  });

  await teste('login: senha errada é recusada; origem de outro site é recusada', async () => {
    assert.equal((await pedir('/api/cms/entrar', { metodo: 'POST', corpo: { senha: 'errada' } })).status, 401);
    assert.equal((await pedir('/api/cms/entrar', { metodo: 'POST', corpo: { senha }, origem: 'https://outro.example' })).status, 403);
    assert.equal((await pedir('/api/cms/entrar', { metodo: 'POST', corpo: { senha }, tipo: 'text/plain' })).status, 415);
  });

  await teste('login: senha certa cria a sessão (cookie HttpOnly e SameSite=Strict)', async () => {
    const r = await pedir('/api/cms/entrar', { metodo: 'POST', corpo: { senha } });
    assert.equal(r.status, 200);
    const definido = r.cabecalhos.get('set-cookie');
    assert.match(definido, /HttpOnly/);
    assert.match(definido, /SameSite=Strict/);
    cookie = definido.split(';')[0];
    assert.equal((await pedir('/api/cms/sessao')).dados.autenticado, true);
  });

  await teste('sessão adulterada não vale', async () => {
    const [nome, valor] = cookie.split('=');
    const partes = valor.split('.');
    const falso = `${nome}=${partes[0]}.${Number(partes[1]) + 99999}.${partes[2]}`;
    const r = await fetch(base + '/api/cms/conteudo', { headers: { Cookie: falso } });
    assert.equal(r.status, 401);
  });

  let rev;
  await teste('conteúdo inicial vazio: o site sai idêntico ao original', async () => {
    const r = await pedir('/api/cms/conteudo');
    assert.equal(r.status, 200);
    rev = r.dados.rascunho.rev;
    assert.deepEqual(r.dados.publicado.conteudo.textos, {});
    assert.equal((await pedir('/', { semCookie: true })).texto, originalInicio);
  });

  await teste('validação: conteúdo inválido não é gravado', async () => {
    const r = await pedir('/api/cms/rascunho', { metodo: 'PUT', corpo: { rev, conteudo: { perfis: ['http://inseguro.example'], redirecionamentos: [{ de: '/admin', para: '/' }], faq: { '/': [] } } } });
    assert.equal(r.status, 422);
    assert.equal(r.dados.erros.length, 3);
  });

  const conteudo = {
    textos: {
      'Da ideia ao produto.': 'Da ideia ao produto <protegido> & pronto.',
      'Contar sobre meu projeto': 'Falar do meu projeto',
      'KAS-Trom Projetos': 'KAS-Trom "Projetos"', // é o alt da logo
      'portfólio': 'portfólio completo',
    },
    seo: { '/': { titulo: 'Título novo & "teste" | KAS-Trom', descricao: 'Descrição nova para o Google.' } },
    faq: { '/': [
      { pergunta: 'Pergunta nova 1?', resposta: 'Resposta 1, primeiro parágrafo.\n\nSegundo parágrafo.' },
      { pergunta: 'Pergunta nova 2?', resposta: 'Resposta 2.' },
      { pergunta: 'Pergunta nova 3?', resposta: 'Resposta 3.' },
      { pergunta: 'Pergunta nova 4?', resposta: 'Resposta 4.' },
      { pergunta: 'Pergunta nova 5?', resposta: 'Resposta 5 <b>sem html</b>.' },
      { pergunta: 'Pergunta nova 6?', resposta: 'Resposta 6.' },
    ] },
    llms: '# KAS-Trom Projetos\n\n> Resumo de teste.\n',
    perfis: ['https://www.linkedin.com/company/exemplo'],
    redirecionamentos: [{ de: '/antigo', para: '/servicos', codigo: 301 }],
  };

  await teste('rascunho: grava, e gravação com revisão antiga é recusada (409)', async () => {
    const r = await pedir('/api/cms/rascunho', { metodo: 'PUT', corpo: { rev, conteudo } });
    assert.equal(r.status, 200, r.texto);
    assert.equal(r.dados.rascunho.rev, rev + 1);
    assert.equal((await pedir('/api/cms/rascunho', { metodo: 'PUT', corpo: { rev, conteudo } })).status, 409);
    rev = r.dados.rascunho.rev;
  });

  await teste('rascunho não aparece para visitantes; aparece na prévia de quem está logado', async () => {
    assert.equal((await pedir('/', { semCookie: true })).texto, originalInicio);
    assert.equal((await pedir('/llms.txt', { semCookie: true })).texto, originalLlms);
    const previa = await pedir('/?cms=rascunho');
    assert.match(previa.texto, /Da ideia ao produto &lt;protegido&gt; &amp; pronto\./);
    assert.equal(previa.cabecalhos.get('x-frame-options'), null);
    assert.match(previa.cabecalhos.get('content-security-policy'), /frame-ancestors 'self'/);
    assert.equal(previa.cabecalhos.get('cache-control'), 'no-store');
    const original = await pedir('/?cms=original');
    assert.equal(original.texto, originalInicio);
    assert.equal(original.cabecalhos.get('x-frame-options'), null);
  });

  await teste('publicar: texto com a marca [CONFIRMAR] trava a publicação até ser revisto', async () => {
    const marcado = { ...conteudo, faq: { '/': [{ pergunta: 'Vocês assinam NDA?', resposta: '[CONFIRMAR] Sim, antes de receber detalhes técnicos.' }] } };
    const salvo = await pedir('/api/cms/rascunho', { metodo: 'PUT', corpo: { rev, conteudo: marcado } });
    assert.equal(salvo.status, 200);
    const recusado = await pedir('/api/cms/publicar', { metodo: 'POST', corpo: {} });
    assert.equal(recusado.status, 422);
    assert.match(recusado.dados.erro, /\[CONFIRMAR\]/);
    rev = (await pedir('/api/cms/rascunho', { metodo: 'PUT', corpo: { rev: salvo.dados.rascunho.rev, conteudo } })).dados.rascunho.rev;
  });

  await teste('publicar: o site passa a sair com as edições', async () => {
    const r = await pedir('/api/cms/publicar', { metodo: 'POST', corpo: { nota: 'Teste automático' } });
    assert.equal(r.status, 200, r.texto);
    assert.equal((await pedir('/api/cms/publicar', { metodo: 'POST', corpo: {} })).status, 409); // nada novo a publicar
  });

  let publicada;
  await teste('camada: textos, atributos e espaços ao redor de links', async () => {
    publicada = (await pedir('/', { semCookie: true })).texto;
    assert.match(publicada, /Da ideia ao produto &lt;protegido&gt; &amp; pronto\.<br/);
    assert.ok(!publicada.includes('>Contar sobre meu projeto<'));
    assert.equal(publicada.split('>Falar do meu projeto<').length - 1, 2); // os dois botões da página
    assert.match(publicada, /alt="KAS-Trom &quot;Projetos&quot;"/);
    const sobre = (await pedir('/sobre', { semCookie: true })).texto;
    assert.match(sobre, /o caso do nosso <a href="\/portfolio"[^>]*>portfólio completo<\/a> é um projeto próprio/);
  });

  await teste('camada: título, descrição e Open Graph', async () => {
    assert.match(publicada, /<title>Título novo &amp; &quot;teste&quot; \| KAS-Trom<\/title>/);
    assert.match(publicada, /<meta name="description" content="Descrição nova para o Google\.">/);
    assert.match(publicada, /<meta property="og:title" content="Título novo &amp; &quot;teste&quot; \| KAS-Trom">/);
    assert.match(publicada, /<meta property="og:description" content="Descrição nova para o Google\.">/);
    // outras páginas mantêm o próprio título
    assert.match((await pedir('/servicos', { semCookie: true })).texto, /<title>Serviços de engenharia, patentes e gestão \| KAS-Trom Projetos<\/title>/);
  });

  await teste('camada: perguntas frequentes (troca, acréscimo, sem HTML injetado)', async () => {
    const blocos = publicada.match(/<details class="faq[^>]*>/g) || [];
    assert.equal(blocos.length, 6);
    assert.ok(!publicada.includes('Meu projeto pode ser patenteado?'));
    assert.match(publicada, /Pergunta nova 6\?<span class="faq-icone[^>]*><\/span><\/summary><p class="[^"]*"[^>]*>Resposta 6\.<\/p><\/details>/);
    assert.match(publicada, /primeiro parágrafo\.<\/p><p [^>]*>Segundo parágrafo\.<\/p>/);
    assert.match(publicada, /Resposta 5 &lt;b&gt;sem html&lt;\/b&gt;\./);
    // o que vem depois da FAQ continua lá e foi editado
    assert.match(publicada, /Tem uma ideia ou um produto em desenvolvimento\?/);
  });

  await teste('camada: dados estruturados continuam válidos e iguais ao que se lê na página', async () => {
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(publicada)[1]);
    const por = (tipo) => ld['@graph'].find((n) => n['@type'] === tipo);
    assert.equal(por('WebPage').name, 'Título novo & "teste" | KAS-Trom');
    assert.equal(por('WebPage').description, 'Descrição nova para o Google.');
    assert.equal(por('FAQPage').mainEntity.length, 6);
    assert.equal(por('FAQPage').mainEntity[0].name, 'Pergunta nova 1?');
    assert.equal(por('FAQPage').mainEntity[0].acceptedAnswer.text, 'Resposta 1, primeiro parágrafo. Segundo parágrafo.');
    assert.deepEqual(por('Organization').sameAs, ['https://www.linkedin.com/company/exemplo']);
    assert.equal(por('Organization').name, 'KAS-Trom "Projetos"');
    assert.equal(por('Organization')['@id'], 'https://kastrom.eng.br/#organizacao');
  });

  await teste('camada: scripts da página não são tocados e a página termina inteira', async () => {
    assert.ok(publicada.includes('document.getElementById(`menu-botao`)'));
    assert.ok(publicada.includes('"prefetch"'));
    assert.match(publicada, /<\/html>/);
    assert.equal(publicada.split('<h1').length - 1, 1);
  });

  await teste('llms.txt e redirecionamentos publicados', async () => {
    const llms = await pedir('/llms.txt', { semCookie: true });
    assert.equal(llms.texto, '# KAS-Trom Projetos\n\n> Resumo de teste.\n');
    assert.match(llms.cabecalhos.get('content-type'), /text\/plain/);
    const r = await pedir('/antigo', { semCookie: true });
    assert.equal(r.status, 301);
    assert.equal(new URL(r.cabecalhos.get('location')).pathname, '/servicos');
  });

  await teste('página 404 continua 404, com os textos globais editados', async () => {
    const r = await pedir('/nao-existe', { semCookie: true });
    assert.equal(r.status, 404);
    assert.match(r.texto, />Falar do meu projeto</);
  });

  // ——— Biblioteca de mídia e seção "outros projetos" ———
  const enviar = (dados, tipo, nome, comCookie = true) => fetch(`${base}/api/cms/midia?nome=${encodeURIComponent(nome)}`, {
    method: 'POST', body: dados, headers: { Origin: base, 'Content-Type': tipo, ...(comCookie ? { Cookie: cookie } : {}) },
  }).then(async (r) => ({ status: r.status, dados: await r.json() }));
  let video;
  let capa;

  await teste('mídia: só para quem está logado, e o conteúdo real do arquivo é conferido', async () => {
    const mp4 = await readFile(join(midia, 'clipe.mp4'));
    const jpg = await readFile(join(midia, 'capa.jpg'));
    assert.equal((await enviar(mp4, 'video/mp4', 'clipe.mp4', false)).status, 401);
    assert.equal((await enviar(Buffer.from('<html><script>alert(1)</script></html>'), 'video/mp4', 'falso.mp4')).status, 415);
    assert.equal((await enviar(Buffer.alloc(0), 'video/mp4', 'vazio.mp4')).status, 400);
    assert.equal((await enviar(Buffer.alloc(11 * 1024 * 1024, 1), 'video/mp4', 'grande.mp4')).status, 413);
    video = (await enviar(mp4, 'application/octet-stream', 'clipe.mp4')).dados.arquivo; // o tipo vem do conteúdo, não do que o navegador diz
    capa = (await enviar(jpg, 'image/jpeg', 'capa.jpg')).dados.arquivo;
    assert.match(video.endereco, /^\/midia\/[0-9a-f]{24}$/);
    assert.equal(video.tipo, 'video/mp4');
    assert.equal(capa.tipo, 'image/jpeg');
    assert.equal((await enviar(mp4, 'video/mp4', 'de-novo.mp4')).dados.arquivo.chave, video.chave); // mesmo arquivo, mesmo lugar
    assert.equal((await pedir('/api/cms/midia')).dados.arquivos.length, 2);
  });

  await teste('mídia: entrega pública com tipo certo, cache longo e pedido de trecho', async () => {
    const original = await readFile(join(midia, 'clipe.mp4'));
    const inteiro = await fetch(base + video.endereco);
    assert.equal(inteiro.status, 200);
    assert.equal(inteiro.headers.get('content-type'), 'video/mp4');
    assert.match(inteiro.headers.get('cache-control'), /immutable/);
    assert.equal(inteiro.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(Buffer.from(await inteiro.arrayBuffer()).equals(original));
    const trecho = await fetch(base + video.endereco, { headers: { Range: 'bytes=0-99' } });
    assert.equal(trecho.status, 206);
    assert.equal(trecho.headers.get('content-range'), `bytes 0-99/${original.length}`);
    assert.equal((await trecho.arrayBuffer()).byteLength, 100);
    assert.equal((await fetch(base + video.endereco, { headers: { Range: 'bytes=99999999-' } })).status, 416);
    assert.equal((await fetch(`${base}/midia/${'0'.repeat(24)}`)).status, 404);
    assert.equal((await fetch(`${base}/midia/..%2Fpublicado`)).status, 404);
  });

  await teste('projetos: validação recusa endereço de fora do site e projeto sem capa', async () => {
    const com = (item) => ({ ...conteudo, projetos: { titulo: 'Outros projetos', texto: '', itens: [item] } });
    for (const item of [
      { titulo: 'X', capa: 'https://outro.example/c.jpg' }, { titulo: 'X', capa: '//outro.example/c.jpg' },
      { titulo: 'X', capa: capa.endereco, video: 'javascript:alert(1)' }, { titulo: 'X' }, { titulo: '', capa: capa.endereco },
    ]) assert.equal((await pedir('/api/cms/rascunho', { metodo: 'PUT', corpo: { rev, conteudo: com(item) } })).status, 422, JSON.stringify(item));
  });

  await teste('projetos: a seção entra na página inicial, depois do caso em destaque, e só nela', async () => {
    const projetos = { titulo: 'Outros projetos', texto: 'Uma amostra de projetos.', atalho: 'Ver outros projetos', itens: [
      { titulo: 'Varredor <frontal>', segmento: 'Máquinas agrícolas', ano: '2024', descricao: 'Modelo virtual & simulação.', video: video.endereco, capa: capa.endereco },
      { titulo: 'Tanque com contenção', capa: capa.endereco },
    ] };
    const salvo = await pedir('/api/cms/rascunho', { metodo: 'PUT', corpo: { rev, conteudo: { ...conteudo, projetos } } });
    assert.equal(salvo.status, 200, salvo.texto);
    rev = salvo.dados.rascunho.rev;
    assert.ok(!(await pedir('/', { semCookie: true })).texto.includes('cms-projetos'), 'rascunho não aparece para visitantes');
    assert.equal((await pedir('/api/cms/publicar', { metodo: 'POST', corpo: { nota: 'Projetos' } })).status, 200);

    const inicio = (await pedir('/', { semCookie: true })).texto;
    const posicao = (trecho) => inicio.indexOf(trecho);
    assert.ok(posicao('Conhecer o caso') < posicao('<section class="cms-projetos" id="projetos">'));
    assert.ok(posicao('<section class="cms-projetos" id="projetos">') < posicao('Perguntas frequentes</h2>'));
    assert.equal(inicio.split('class="cms-projetos"').length - 1, 1);
    // o atalho fica no topo, logo depois do botão do portfólio, uma vez só
    assert.equal(inicio.split('<a href="#projetos" class="btn btn-ghost">Ver outros projetos</a>').length - 1, 1);
    assert.ok(posicao('Ver o caso do portfólio</a><a href="#projetos"') > 0 && posicao('<a href="#projetos"') < posicao('<video'));
    assert.ok(inicio.includes(`<video controls muted loop playsinline preload="none" poster="${capa.endereco}" src="${video.endereco}" aria-label="Animação em 3D: Varredor &lt;frontal&gt;"></video>`));
    assert.match(inicio, /<p class="cms-projeto-meta">Máquinas agrícolas · 2024<\/p><h3>Varredor &lt;frontal&gt;<\/h3><p class="cms-projeto-texto">Modelo virtual &amp; simulação\.<\/p>/);
    assert.ok(inicio.includes(`<img src="${capa.endereco}" alt="Tanque com contenção"`));
    assert.equal(inicio.split('<h1').length - 1, 1);
    assert.match(inicio, /<\/main><footer/);
    assert.ok(!(await pedir('/servicos', { semCookie: true })).texto.includes('cms-projetos'));
  });

  await teste('mídia: arquivo em uso não pode ser apagado', async () => {
    const r = await pedir(`/api/cms/midia/${video.chave}`, { metodo: 'DELETE', tipo: null });
    assert.equal(r.status, 409);
    assert.equal((await fetch(base + video.endereco)).status, 200);
  });

  await teste('painel e API ficam fora dos buscadores e sem cache', async () => {
    const painel = await pedir('/admin/', { semCookie: true });
    assert.match(painel.cabecalhos.get('x-robots-tag'), /noindex/);
    assert.equal((await pedir('/api/cms/sessao')).cabecalhos.get('cache-control'), 'no-store');
  });

  await teste('histórico: lista a publicação e restaura como rascunho', async () => {
    const lista = (await pedir('/api/cms/versoes')).dados.versoes;
    assert.equal(lista.length, 2);
    assert.deepEqual(lista.map((v) => v.nota), ['Projetos', 'Teste automático']);
    const vazio = await pedir('/api/cms/rascunho', { metodo: 'PUT', corpo: { rev, conteudo: {} } });
    assert.equal(vazio.status, 200);
    const restaurado = await pedir('/api/cms/restaurar', { metodo: 'POST', corpo: { id: lista[0].id } });
    assert.equal(restaurado.dados.rascunho.conteudo.seo['/'].titulo, 'Título novo & "teste" | KAS-Trom');
    rev = restaurado.dados.rascunho.rev;
  });

  await teste('voltar ao original: publicar conteúdo vazio devolve o site byte a byte', async () => {
    assert.equal((await pedir('/api/cms/rascunho', { metodo: 'PUT', corpo: { rev, conteudo: {} } })).status, 200);
    assert.equal((await pedir('/api/cms/publicar', { metodo: 'POST', corpo: { nota: 'Limpar' } })).status, 200);
    assert.equal((await pedir('/', { semCookie: true })).texto, originalInicio);
    assert.equal((await pedir('/llms.txt', { semCookie: true })).texto, originalLlms);
    assert.equal((await pedir('/antigo', { semCookie: true })).status, 404);
    // com a seção fora do ar, o arquivo deixa de estar em uso e pode ser apagado
    assert.equal((await pedir(`/api/cms/midia/${video.chave}`, { metodo: 'DELETE', tipo: null })).status, 200);
    assert.equal((await fetch(base + video.endereco, { cache: 'no-store' })).status, 404);
  });

  await teste('login: depois de 8 senhas erradas do mesmo endereço, novas tentativas são travadas', async () => {
    const tentar = (senhaTentada) => fetch(`${base}/api/cms/entrar`, {
      method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.77' }, body: JSON.stringify({ senha: senhaTentada }),
    }).then((r) => r.status);
    for (let i = 0; i < 8; i++) assert.equal(await tentar(`errada-${i}`), 401);
    assert.equal(await tentar('errada-de-novo'), 429);
    assert.equal(await tentar(senha), 429, 'nem a senha certa entra enquanto a trava vale');
    // outros endereços não são afetados
    assert.equal((await pedir('/api/cms/entrar', { metodo: 'POST', corpo: { senha } })).status, 200);
  });

  await teste('sair encerra a sessão', async () => {
    const r = await pedir('/api/cms/sair', { metodo: 'POST', corpo: {} });
    assert.match(r.cabecalhos.get('set-cookie'), /Max-Age=0/);
  });
}
