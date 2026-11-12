import test from 'node:test';
import assert from 'node:assert/strict';
import { lerIntervalo } from '../../worker/video.js';
import { gerarHashDaSenha, conferirSenha, criarFicha, fichaValida, oQueFalta } from '../../worker/cms/sessao.js';
import { atualizarJsonLd, precisaDeCamada } from '../../worker/cms/camada.js';

test('vídeo: leitura do pedido de trecho (Range)', () => {
  assert.deepEqual(lerIntervalo('bytes=0-99', 1000), { inicio: 0, fim: 99 });
  assert.deepEqual(lerIntervalo('bytes=900-', 1000), { inicio: 900, fim: 999 });
  assert.deepEqual(lerIntervalo('bytes=-100', 1000), { inicio: 900, fim: 999 });
  assert.deepEqual(lerIntervalo('bytes=0-99999', 1000), { inicio: 0, fim: 999 });
  assert.equal(lerIntervalo('bytes=1000-', 1000), 'impossivel');
  assert.equal(lerIntervalo('bytes=-0', 1000), 'impossivel');
  assert.equal(lerIntervalo('bytes=50-10', 1000), 'ignorar');
  assert.equal(lerIntervalo('bytes=0-1,5-9', 1000), 'ignorar');
  assert.equal(lerIntervalo('itens=0-1', 1000), 'ignorar');
});

test('senha: o código gerado confere com a senha certa e só com ela', async () => {
  const hash = await gerarHashDaSenha('uma frase longa e só minha');
  assert.match(hash, /^pbkdf2-sha256\$100000\$[\w-]+\$[\w-]+$/);
  assert.equal(await conferirSenha('uma frase longa e só minha', hash), true);
  assert.equal(await conferirSenha('uma frase longa e só minhA', hash), false);
  assert.equal(await conferirSenha('', hash), false);
  assert.equal(await conferirSenha('x', 'formato-invalido'), false);
  assert.equal(await conferirSenha('x', 'pbkdf2-sha256$5$AAAA$AAAA'), false); // iterações de menos
  assert.notEqual(hash, await gerarHashDaSenha('uma frase longa e só minha')); // sal diferente a cada vez
});

test('sessão: a ficha vale até expirar e não aceita adulteração', async () => {
  const segredo = 's'.repeat(48);
  const agora = Date.UTC(2026, 10, 12);
  const ficha = await criarFicha(segredo, agora);
  assert.equal(await fichaValida(ficha, segredo, agora), true);
  assert.equal(await fichaValida(ficha, segredo, agora + 11 * 3600 * 1000), true);
  assert.equal(await fichaValida(ficha, segredo, agora + 13 * 3600 * 1000), false);
  assert.equal(await fichaValida(ficha, 'outro-segredo'.repeat(4), agora), false);
  const [v, validade, assinatura] = ficha.split('.');
  assert.equal(await fichaValida(`${v}.${Number(validade) + 1}.${assinatura}`, segredo, agora), false);
  assert.equal(await fichaValida('', segredo, agora), false);
  assert.equal(await fichaValida('v1.abc.def', segredo, agora), false);
});

test('configuração: aponta o que falta na Cloudflare', () => {
  assert.deepEqual(oQueFalta({}), ['CMS', 'CMS_SENHA_HASH', 'CMS_SEGREDO']);
  assert.deepEqual(oQueFalta({ CMS: {}, CMS_SENHA_HASH: 'x', CMS_SEGREDO: 'curto' }), ['CMS_SEGREDO']);
  assert.deepEqual(oQueFalta({ CMS: {}, CMS_SENHA_HASH: 'x', CMS_SEGREDO: 's'.repeat(32) }), []);
});

test('dados estruturados: troca textos, perguntas e perfis sem tocar em endereços e identificadores', () => {
  const dados = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', '@id': 'https://x/#org', name: 'KAS-Trom Projetos', url: 'https://x/', email: 'a@x', description: 'Texto  antigo' },
    { '@type': ['WebPage', 'FAQPage'], name: 'Título antigo', mainEntity: [{ '@type': 'Question', name: 'Velha?' }] },
  ] };
  const saida = atualizarJsonLd(dados, {
    mapa: new Map([['Texto antigo', 'Texto novo'], ['Título antigo', 'Título novo'], ['https://x/', 'NÃO'], ['a@x', 'NÃO']]),
    faq: [{ pergunta: 'Nova?', resposta: 'Sim.\n\nMesmo.' }],
    perfis: ['https://perfil.example'],
  });
  const [org, pagina] = saida['@graph'];
  assert.equal(org.description, 'Texto novo');
  assert.equal(org.url, 'https://x/');
  assert.equal(org.email, 'a@x');
  assert.equal(org['@id'], 'https://x/#org');
  assert.deepEqual(org.sameAs, ['https://perfil.example']);
  assert.equal(pagina.name, 'Título novo');
  assert.deepEqual(pagina.mainEntity, [{ '@type': 'Question', name: 'Nova?', acceptedAnswer: { '@type': 'Answer', text: 'Sim. Mesmo.' } }]);
  assert.equal(dados['@graph'][0].description, 'Texto  antigo', 'o original não é modificado');
});

test('camada: só entra em ação quando há edição para a página', () => {
  assert.equal(precisaDeCamada(null, '/'), false);
  assert.equal(precisaDeCamada({ textos: {}, seo: {}, faq: {}, perfis: [] }, '/'), false);
  assert.equal(precisaDeCamada({ textos: {}, seo: { '/sobre': { titulo: 'x' } }, faq: {}, perfis: [] }, '/'), false);
  assert.equal(precisaDeCamada({ textos: {}, seo: { '/sobre': { titulo: 'x' } }, faq: {}, perfis: [] }, '/sobre'), true);
  assert.equal(precisaDeCamada({ textos: { a: 'b' }, seo: {}, faq: {}, perfis: [] }, '/qualquer'), true);
});

test('mídia: o tipo do arquivo é reconhecido pelo conteúdo, não pelo nome', async () => {
  const { tipoReal } = await import('../../worker/cms/midia.js');
  const { readFile } = await import('node:fs/promises');
  const ler = async (nome) => new Uint8Array(await readFile(new URL(`../fixtures/midia/${nome}`, import.meta.url)));
  assert.equal(tipoReal(await ler('clipe.mp4')), 'video/mp4');
  assert.equal(tipoReal(await ler('clipe.webm')), 'video/webm');
  assert.equal(tipoReal(await ler('capa.jpg')), 'image/jpeg');
  assert.equal(tipoReal(new TextEncoder().encode('<html><script>alert(1)</script></html>')), null);
  assert.equal(tipoReal(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')), null);
  assert.equal(tipoReal(new Uint8Array(4)), null);
});

test('projetos: o HTML da seção protege todos os textos e endereços', async () => {
  const { htmlDosProjetos } = await import('../../worker/cms/camada.js');
  assert.equal(htmlDosProjetos(null), '');
  assert.equal(htmlDosProjetos({ titulo: 'x', itens: [] }), '');
  const html = htmlDosProjetos({ titulo: 'Outros <b>projetos</b>', texto: 'A & B', itens: [
    { titulo: '"Varredor"', segmento: 'Agro', ano: '2024', descricao: '<img onerror=x>', video: '/midia/v', capa: '/midia/c' },
    { titulo: 'Só capa', segmento: '', ano: '', descricao: '', video: '', capa: '/midia/c2' },
  ] });
  assert.ok(html.startsWith('<section class="cms-projetos" id="projetos">'));
  assert.ok(html.includes('Outros &lt;b&gt;projetos&lt;/b&gt;'));
  assert.ok(html.includes('aria-label="Animação em 3D: &quot;Varredor&quot;"'));
  assert.ok(html.includes('&lt;img onerror=x&gt;'));
  assert.ok(!html.includes('<img onerror'));
  assert.ok(html.includes('<img src="/midia/c2" alt="Só capa"'));
  assert.equal(html.split('<video ').length - 1, 1);
  assert.ok(html.includes('preload="none"'));
});
