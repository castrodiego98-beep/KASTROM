import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, decodificarEntidades, escaparHtml, chavePagina, validarConteudo, diferencas, temAlteracoes, conteudoVazio } from '../../admin/js/comum.js';

test('normalizar junta espaços, quebras de linha e espaços não separáveis', () => {
  assert.equal(normalizar('  Da ideia\n   ao produto.  '), 'Da ideia ao produto.');
  assert.equal(normalizar(null), '');
});

test('decodificarEntidades entende nomes, números e deixa o desconhecido como está', () => {
  assert.equal(decodificarEntidades('P&amp;D &lt;b&gt; &quot;x&quot; &#39;y&#x27; In&iacute;cio&nbsp;fim'), 'P&D <b> "x" \'y\' Início fim');
  assert.equal(decodificarEntidades('&naoexiste; &#99999999;'), '&naoexiste; &#99999999;');
  assert.equal(decodificarEntidades('sem entidade'), 'sem entidade');
});

test('escaparHtml protege os cinco caracteres perigosos', () => {
  assert.equal(escaparHtml(`<a href="x">Tom & 'Jerry'</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
});

test('chavePagina padroniza o endereço da página', () => {
  assert.equal(chavePagina('/'), '/');
  assert.equal(chavePagina('/servicos/'), '/servicos');
  assert.equal(chavePagina('/servicos.html?x=1#y'), '/servicos');
  assert.equal(chavePagina('/index.html'), '/');
  assert.equal(chavePagina(''), '/');
});

test('validarConteudo limpa textos e descarta o que é igual ao original', () => {
  const r = validarConteudo({ textos: { '  Olá   mundo ': 'Olá mundo', 'Contato': '  Fale   conosco ', '': 'x' } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.conteudo.textos, { Contato: 'Fale conosco' });
});

test('validarConteudo aceita texto vazio (remove o texto da página)', () => {
  assert.deepEqual(validarConteudo({ textos: { Aviso: '' } }).conteudo.textos, { Aviso: '' });
});

test('validarConteudo recusa tipos errados e textos enormes', () => {
  assert.equal(validarConteudo(null).ok, false);
  assert.equal(validarConteudo({ textos: [] }).ok, false);
  assert.equal(validarConteudo({ textos: { a: 5 } }).ok, false);
  assert.equal(validarConteudo({ textos: { a: 'x'.repeat(7000) } }).ok, false);
  assert.equal(validarConteudo({ llms: 'x'.repeat(40000) }).ok, false);
});

test('validarConteudo: SEO por página', () => {
  const r = validarConteudo({ seo: { '/servicos/': { titulo: ' Serviços ', descricao: '' }, 'sem-barra': { titulo: 'x' } } });
  assert.equal(r.ok, false);
  assert.deepEqual(r.conteudo.seo, { '/servicos': { titulo: 'Serviços' } });
  assert.equal(validarConteudo({ seo: { '/': { titulo: 'x'.repeat(200) } } }).ok, false);
});

test('validarConteudo: perguntas frequentes precisam de pergunta e resposta', () => {
  assert.equal(validarConteudo({ faq: { '/': [{ pergunta: 'A?', resposta: '' }] } }).ok, false);
  assert.equal(validarConteudo({ faq: { '/': [] } }).ok, false);
  const r = validarConteudo({ faq: { '/': [{ pergunta: ' A? ', resposta: 'Um.\n\n\n  Dois. ' }] } });
  assert.deepEqual(r.conteudo.faq['/'], [{ pergunta: 'A?', resposta: 'Um.\n\nDois.' }]);
});

test('validarConteudo: perfis só com https e sem repetição', () => {
  assert.equal(validarConteudo({ perfis: ['http://x.example'] }).ok, false);
  assert.equal(validarConteudo({ perfis: ['javascript:alert(1)'] }).ok, false);
  assert.deepEqual(validarConteudo({ perfis: ['https://a.example/x', 'https://a.example/x', ''] }).conteudo.perfis, ['https://a.example/x']);
});

test('validarConteudo: redirecionamentos seguros', () => {
  const ok = validarConteudo({ redirecionamentos: [{ de: '/antigo/', para: '/novo', codigo: 301 }, { de: '/fora', para: 'https://exemplo.com/x' }] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.conteudo.redirecionamentos, [{ de: '/antigo', para: '/novo', codigo: 301 }, { de: '/fora', para: 'https://exemplo.com/x', codigo: 301 }]);
  for (const ruim of [
    { de: '/admin/x', para: '/' }, { de: '/api/cms/x', para: '/' }, { de: 'sem-barra', para: '/' }, { de: '/a', para: '//evil.example' },
    { de: '/a', para: 'http://inseguro.example' }, { de: '/a', para: 'javascript:alert(1)' }, { de: '/a', para: '/a' }, { de: '/a', para: '/b', codigo: 200 },
  ]) assert.equal(validarConteudo({ redirecionamentos: [ruim] }).ok, false, JSON.stringify(ruim));
  assert.equal(validarConteudo({ redirecionamentos: [{ de: '/a', para: '/b' }, { de: '/a', para: '/c' }] }).ok, false, 'origem repetida');
  assert.equal(validarConteudo({ redirecionamentos: [{ de: '/a', para: '/b' }, { de: '/b', para: '/c' }] }).ok, false, 'cadeia');
});

test('diferencas lista o que mudou, em cada tipo de conteúdo', () => {
  const antes = { ...conteudoVazio(), textos: { A: 'B', X: 'Y' }, seo: { '/': { titulo: 'T' } } };
  const depois = { ...conteudoVazio(), textos: { A: 'C' }, seo: { '/': { titulo: 'T', descricao: 'D' } }, llms: '# x\n', perfis: ['https://a.example'] };
  const d = diferencas(antes, depois);
  assert.deepEqual(d.map((x) => x.tipo), ['texto', 'texto', 'seo', 'llms', 'perfis']);
  assert.deepEqual(d[1], { tipo: 'texto', onde: 'X', de: 'Y', para: 'X' }); // edição desfeita: volta ao original
  assert.equal(diferencas(antes, antes).length, 0);
});

test('temAlteracoes só é verdadeiro quando há algo a aplicar', () => {
  assert.equal(temAlteracoes(conteudoVazio()), false);
  assert.equal(temAlteracoes(null), false);
  assert.equal(temAlteracoes({ ...conteudoVazio(), llms: '# x\n' }), true);
});

test('rascunho sugerido (conteudo/rascunho-sugerido.json) pode ser carregado no painel', async () => {
  const { readFile } = await import('node:fs/promises');
  const { SEO } = await import('../../admin/js/comum.js');
  const arquivo = JSON.parse(await readFile(new URL('../../conteudo/rascunho-sugerido.json', import.meta.url), 'utf8'));
  const r = validarConteudo(arquivo.conteudo);
  assert.deepEqual(r.erros, []);
  const perguntas = r.conteudo.faq['/'];
  assert.equal(perguntas.length, 13);
  assert.ok(perguntas.some((p) => /NDA/.test(p.pergunta)));
  for (const p of perguntas) {
    assert.ok(p.pergunta.endsWith('?'), p.pergunta);
    assert.ok(p.resposta.length >= 80 && p.resposta.length <= 600, `${p.pergunta}: ${p.resposta.length} caracteres`);
  }
  for (const [pagina, seo] of Object.entries(r.conteudo.seo)) {
    if (seo.titulo) assert.ok(seo.titulo.length >= SEO.tituloMin && seo.titulo.length <= SEO.tituloMax, `${pagina}: título com ${seo.titulo.length}`);
    if (seo.descricao) assert.ok(seo.descricao.length >= SEO.descricaoMin && seo.descricao.length <= SEO.descricaoMax, `${pagina}: descrição com ${seo.descricao.length}`);
  }
});

test('validarConteudo: seção de projetos', () => {
  const base = { titulo: 'Outros projetos', texto: 'Amostra.', atalho: 'Ver outros projetos' };
  const ok = validarConteudo({ projetos: { ...base, itens: [{ titulo: ' Varredor ', segmento: 'Agrícola', ano: '2024', descricao: 'x', video: '/midia/abc', capa: '/midia/def' }] } });
  assert.deepEqual(ok.erros, []);
  assert.equal(ok.conteudo.projetos.itens[0].titulo, 'Varredor');
  assert.equal(validarConteudo({ projetos: { ...base, itens: [] } }).conteudo.projetos, null, 'sem itens, sem seção');
  assert.equal(validarConteudo({ projetos: null }).conteudo.projetos, null);
  for (const item of [{ titulo: 'x' }, { titulo: '', capa: '/a.jpg' }, { titulo: 'x', capa: 'https://fora.example/a.jpg' }, { titulo: 'x', capa: '/a.jpg', video: '//fora.example/v.mp4' }, { titulo: 'x', capa: '/a.jpg"><script>' }]) {
    assert.equal(validarConteudo({ projetos: { ...base, itens: [item] } }).ok, false, JSON.stringify(item));
  }
  assert.equal(validarConteudo({ projetos: { ...base, titulo: '', itens: [{ titulo: 'x', capa: '/a.jpg' }] } }).ok, false);
});
