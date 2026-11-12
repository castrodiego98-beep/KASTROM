// Testes do painel no navegador (Playwright): entra, edita, vê a prévia, salva, publica e confere o site.
// O Playwright é opcional: sem ele instalado, estes testes são pulados (os da API continuam rodando).
//   npm i -D playwright axe-core && npx playwright install chromium

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pasta = dirname(fileURLToPath(import.meta.url));

export async function testarPainel(base, senha, relatar) {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch {
    console.log('  (Playwright não instalado: testes do painel pulados)');
    return;
  }
  let axe = null;
  try { axe = await readFile(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch { /* sem axe-core: pula a checagem de acessibilidade */ }

  const capturas = join(pasta, 'capturas');
  await mkdir(capturas, { recursive: true });
  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on('pageerror', (e) => erros.push(`erro de script: ${e.message}`));
  pagina.on('console', (m) => { if (m.type() === 'error' && !/404 \(Not Found\)|401 \(Unauthorized\)/.test(m.text())) erros.push(`console: ${m.text()}`); });

  const teste = async (nome, fn) => { await fn(); relatar(nome); };
  const ir = async (rota) => { await pagina.goto(`${base}/admin/#/${rota}`); await pagina.waitForLoadState('networkidle'); };
  const foto = (nome) => pagina.screenshot({ path: join(capturas, `${nome}.png`) });
  const acessibilidade = async (onde) => {
    if (!axe) return;
    await pagina.addScriptTag({ content: axe });
    const violacoes = await pagina.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((v) => `${v.id}: ${v.nodes[0].html.slice(0, 140)}`));
    assert.deepEqual(violacoes, [], `Acessibilidade em ${onde}`);
  };
  const publico = async (caminho) => (await fetch(base + caminho)).text();

  try {
    await teste('entrada: senha errada mostra erro; senha certa abre o painel', async () => {
      await pagina.goto(`${base}/admin/`);
      await pagina.waitForSelector('#senha');
      await acessibilidade('tela de entrada');
      await foto('01-entrada');
      await pagina.fill('#senha', 'senha-errada');
      await pagina.click('button[type=submit]');
      await pagina.waitForSelector('.entrada-erro:not([hidden])');
      assert.match(await pagina.textContent('.entrada-erro'), /Senha incorreta/);
      await pagina.fill('#senha', senha);
      await pagina.click('button[type=submit]');
      await pagina.waitForSelector('.estrutura');
      await pagina.waitForSelector('.numero');
      assert.match(await pagina.textContent('.barra-estado'), /Tudo publicado/);
      await acessibilidade('visão geral');
      await foto('02-visao-geral');
    });

    await teste('páginas: lista as 6 páginas do site e o cartão de cabeçalho e rodapé', async () => {
      await ir('paginas');
      await pagina.waitForSelector('.pagina-cartao');
      assert.equal(await pagina.locator('.pagina-cartao').count(), 7);
      await acessibilidade('lista de páginas');
    });

    await teste('editor: digitar muda a prévia na hora; clicar na prévia leva ao campo', async () => {
      await ir(`paginas/${encodeURIComponent('/')}`);
      const moldura = pagina.frameLocator('.previa-moldura iframe');
      await moldura.locator('h1').waitFor();
      const campo = pagina.locator('.campo-texto textarea').nth(1);
      assert.equal(await campo.inputValue(), 'Da ideia ao produto.');
      await campo.fill('Da ideia ao produto protegido.');
      assert.match(await moldura.locator('h1').innerText(), /Da ideia ao produto protegido\./);
      assert.match(await pagina.textContent('.barra-estado'), /não salvas/);
      // clicar num texto da prévia foca o campo correspondente (e não navega)
      await moldura.locator('a.btn-primary', { hasText: 'Contar sobre meu projeto' }).first().click();
      await pagina.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA' && document.activeElement.value === 'Contar sobre meu projeto');
      await pagina.keyboard.press('Control+A');
      await pagina.keyboard.type('Falar sobre meu projeto');
      assert.equal(await moldura.locator('a', { hasText: 'Falar sobre meu projeto' }).count(), 2);
      assert.match(await pagina.locator('.campo-texto.ativo .etiqueta').innerText(), /aparece \d+×/);
      await acessibilidade('editor de página');
      await foto('03-editor');
    });

    await teste('editor: aba de busca mostra contadores e a prévia do Google', async () => {
      await pagina.click('.aba:has-text("Busca e compartilhamento")');
      await pagina.fill('#seo-titulo', 'Engenharia de produto e patentes | KAS-Trom Projetos');
      assert.equal(await pagina.textContent('.google-titulo'), 'Engenharia de produto e patentes | KAS-Trom Projetos');
      assert.match(await pagina.locator('.medidor').first().innerText(), /52 caracteres/);
      assert.equal(await pagina.locator('.medidor').first().getAttribute('data-estado'), 'ok');
      await foto('04-editor-seo');
    });

    await teste('salvar com Ctrl+S grava o rascunho; o site público ainda não muda', async () => {
      await pagina.keyboard.press('Control+S');
      await pagina.waitForFunction(() => /aguardam publicação/.test(document.querySelector('.barra-estado').textContent));
      assert.match(await pagina.textContent('#botao-publicar'), /Publicar \(3\)/);
      assert.match(await publico('/'), /<h1[^>]*>Da ideia ao produto\.<br/);
    });

    await teste('perguntas frequentes: acrescentar e reordenar', async () => {
      await ir('faq');
      await pagina.waitForSelector('.item-lista');
      assert.equal(await pagina.locator('.item-lista').count(), 4);
      await pagina.click('#faq-adicionar');
      await pagina.fill('#faq-p-4', 'Quanto tempo leva um pedido de patente?');
      await pagina.fill('#faq-r-4', 'Depende do escopo do projeto e do exame do INPI. A preparação do pedido é combinada caso a caso.\n\nO exame é feito pelo INPI, em prazo que não depende da KAS-Trom.');
      await pagina.click('[aria-label="Subir a pergunta 5"]');
      assert.equal(await pagina.inputValue('#faq-p-3'), 'Quanto tempo leva um pedido de patente?');
      assert.match(await pagina.locator('.cartao .etiqueta').first().innerText(), /5 perguntas/);
      await acessibilidade('perguntas frequentes');
      await foto('05-perguntas');
    });

    await teste('outros projetos: enviar um vídeo gera a capa; projeto incompleto é avisado', async () => {
      await ir('projetos');
      await pagina.waitForSelector('#proj-adicionar');
      assert.match(await pagina.locator('.caixa-info').first().innerText(), /frases? do site diz/); // o site hoje diz que não mostra outros projetos
      await pagina.click('#proj-adicionar');
      await pagina.waitForSelector('[role=alert]:has-text("falta o título")');
      await pagina.setInputFiles('#proj-video-0', join(pasta, '..', 'fixtures', 'midia', 'clipe.webm'));
      await pagina.waitForSelector('.item-lista img[src^="/midia/"]', { timeout: 30000 });
      await pagina.fill('#proj-nome-0', 'Varredor frontal para tratores');
      await pagina.fill('#proj-seg-0', 'Máquinas agrícolas');
      await pagina.fill('#proj-ano-0', '2024');
      await pagina.fill('#proj-desc-0', 'Modelo virtual para simulação do mecanismo de varrição.');
      assert.equal(await pagina.locator('[role=alert]').count(), 0);
      assert.match(await pagina.textContent('.barra-estado'), /não salvas/);
      await acessibilidade('outros projetos');
      await foto('06-projetos');
    });

    await teste('IA e buscadores: gerar o llms.txt e cadastrar um perfil oficial', async () => {
      await ir('ia');
      await pagina.waitForSelector('#llms');
      await pagina.click('#llms-gerar');
      const texto = await pagina.inputValue('#llms');
      assert.match(texto, /^# KAS-Trom Projetos/);
      assert.match(texto, /## Fatos de referência/); // seção escrita à mão foi mantida
      assert.match(texto, /- \[Início\]\(https:\/\/kastrom\.eng\.br\/\): /);
      assert.match(texto, /- \[Serviços de engenharia, patentes e gestão\]\(https:\/\/kastrom\.eng\.br\/servicos\): /);
      assert.match(texto, /## Perguntas frequentes\n\n- \*\*Meu projeto pode ser patenteado\?\*\*/);
      assert.match(texto, /Quanto tempo leva um pedido de patente\?/); // pergunta do rascunho já entra no arquivo
      await pagina.click('#perfil-adicionar');
      await pagina.fill('[aria-label="Perfil 1"]', 'https://www.linkedin.com/company/kas-trom-exemplo');
      await acessibilidade('IA e buscadores');
      await foto('07-ia');
    });

    await teste('redirecionamentos: valida e aceita um endereço antigo', async () => {
      await ir('redirecionamentos');
      await pagina.click('#redir-adicionar');
      await pagina.fill('#r-de-0', '/admin');
      await pagina.fill('#r-para-0', '/servicos');
      await pagina.waitForSelector('[role=alert]');
      await pagina.fill('#r-de-0', '/servico');
      assert.equal(await pagina.locator('[role=alert]').count(), 0);
      await foto('08-redirecionamentos');
    });

    await teste('publicação: lista as alterações, publica e o site passa a mostrá-las', async () => {
      await ir('publicacao');
      await pagina.waitForSelector('.mudanca');
      assert.equal(await pagina.locator('.mudanca').count(), 8);
      await acessibilidade('publicação');
      await foto('09-publicacao');
      await pagina.fill('#nota', 'Teste de ponta a ponta');
      await pagina.click('#publicar-agora');
      await pagina.click('.dialogo .botao-primario');
      await pagina.waitForFunction(() => /Tudo publicado/.test(document.querySelector('.barra-estado').textContent));
      await pagina.waitForSelector('.tabela .etiqueta-ok');

      const inicio = await publico('/');
      assert.match(inicio, /<h1[^>]*>Da ideia ao produto protegido\.<br/);
      assert.match(inicio, /<title>Engenharia de produto e patentes \| KAS-Trom Projetos<\/title>/);
      assert.equal((inicio.match(/<details class="faq/g) || []).length, 5);
      assert.match(inicio, /Quanto tempo leva um pedido de patente\?<span/);
      const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(inicio)[1])['@graph'];
      assert.equal(ld.find((n) => n['@type'] === 'FAQPage').mainEntity.length, 5);
      assert.deepEqual(ld.find((n) => n['@type'] === 'Organization').sameAs, ['https://www.linkedin.com/company/kas-trom-exemplo']);
      assert.match(await publico('/llms.txt'), /## Fatos de referência/);
      assert.match(inicio, /<section class="cms-projetos" id="projetos">/);
      const [, capaPublicada, videoPublicado] = /poster="(\/midia\/[0-9a-f]{24})" src="(\/midia\/[0-9a-f]{24})"/.exec(inicio);
      assert.equal((await fetch(base + capaPublicada)).headers.get('content-type'), 'image/jpeg');
      assert.equal((await fetch(base + videoPublicado)).headers.get('content-type'), 'video/webm');
      assert.match(inicio, /<h3>Varredor frontal para tratores<\/h3>/);
      const antigo = await fetch(`${base}/servico`, { redirect: 'manual' });
      assert.equal(antigo.status, 301);
    });

    await teste('auditoria: roda, dá notas e reconhece as perguntas e o perfil recém-publicados', async () => {
      await ir('auditoria');
      await pagina.click('#auditoria-rodar');
      await pagina.waitForSelector('.notas', { timeout: 60000 });
      assert.equal(await pagina.locator('.nota').count(), 6);
      const geral = Number((await pagina.locator('.nota .numero').first().innerText()).split('/')[0]);
      assert.ok(geral >= 60 && geral <= 100, `nota geral ${geral}`);
      await pagina.click('.filtro:has-text("Tudo")');
      const titulos = await pagina.locator('.achado strong').allInnerTexts();
      assert.ok(titulos.includes('Perfis oficiais da empresa (sameAs)'));
      assert.equal(await pagina.locator('.achado[data-estado="ok"]:has-text("Perfis oficiais da empresa")').count(), 1);
      assert.equal(await pagina.locator('.achado[data-estado="ok"]:has-text("perguntas da página e dos dados estruturados")').count(), 1);
      assert.equal(await pagina.locator('.achado:has-text("código depois do fim do HTML")').count(), 2);
      await pagina.click('.filtro:has-text("A fazer")');
      await acessibilidade('auditoria');
      await pagina.screenshot({ path: join(capturas, '10-auditoria.png'), fullPage: true });
    });

    await teste('descartar: o rascunho volta a ficar igual ao que está no ar', async () => {
      await ir(`paginas/${encodeURIComponent('/sobre')}`);
      await pagina.frameLocator('.previa-moldura iframe').locator('h1').waitFor();
      await pagina.locator('.campo-texto textarea').first().fill('Sobre a KAS-Trom');
      await pagina.click('#botao-salvar');
      await pagina.waitForFunction(() => /aguarda publicação/.test(document.querySelector('.barra-estado').textContent));
      await ir('publicacao');
      await pagina.waitForSelector('.mudanca');
      assert.equal(await pagina.locator('.mudanca').count(), 1);
      await pagina.click('button:has-text("Descartar todas as alterações")');
      await pagina.click('.dialogo .botao-primario');
      await pagina.waitForFunction(() => /Tudo publicado/.test(document.querySelector('.barra-estado').textContent));
      assert.match(await publico('/sobre'), /<h1[^>]*>Sobre a empresa<\/h1>/);
    });

    await teste('celular: o painel funciona em 390 px sem rolagem lateral', async () => {
      await pagina.setViewportSize({ width: 390, height: 844 });
      for (const rota of ['', 'paginas', 'faq', 'projetos', 'auditoria', 'publicacao']) {
        await ir(rota);
        await pagina.waitForTimeout(300);
        const sobra = await pagina.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(sobra <= 1, `rolagem lateral de ${sobra}px em #/${rota}`);
      }
      // as duas colunas da tela de publicação ficam uma embaixo da outra, sem se sobrepor
      const [a, b] = await pagina.evaluate(() => [...document.querySelectorAll('.colunas > section')].map((s) => s.getBoundingClientRect().toJSON()));
      assert.ok(b.top >= a.bottom, 'as colunas não podem se sobrepor no celular');
      await pagina.screenshot({ path: join(capturas, '11-celular.png'), fullPage: true });
      await pagina.setViewportSize({ width: 1440, height: 900 });
    });

    await teste('sair encerra a sessão e volta à tela de entrada', async () => {
      await ir('config');
      await pagina.click('.lateral-pe button');
      await pagina.waitForSelector('#senha');
      const resposta = await pagina.evaluate(() => fetch('/api/cms/conteudo').then((r) => r.status));
      assert.equal(resposta, 401);
    });

    assert.deepEqual(erros, [], 'O painel não deve registrar erros no console');
    relatar('nenhum erro de script durante todo o percurso');
  } finally {
    await navegador.close();
  }
}
