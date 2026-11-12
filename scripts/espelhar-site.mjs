// Baixa uma cópia das páginas publicadas do site para testes/fixtures/site.
// Essa cópia serve para rodar o painel no computador (npm run dev) e para os testes automáticos.
// Uso: npm run espelhar            (usa o endereço abaixo)
//      npm run espelhar -- https://kastrom.eng.br
// PDFs e vídeos não são baixados (são grandes e o painel não precisa deles).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const origem = (process.argv[2] || 'https://kastrom.kastrom.workers.dev').replace(/\/+$/, '');
const destino = join(dirname(fileURLToPath(import.meta.url)), '..', 'testes', 'fixtures', 'site');
const IGNORAR = /\.(pdf|mp4|webm|mov|zip)$/i;
const FIXOS = ['/', '/404', '/obrigado', '/robots.txt', '/llms.txt', '/sitemap-index.xml', '/manifest.webmanifest', '/favicon.ico', '/og.png'];

const fila = [...FIXOS];
const vistos = new Set(fila);
const adicionar = (endereco, base) => {
  let url;
  try { url = new URL(endereco, base); } catch { return; }
  if (url.origin !== origem && url.hostname !== 'kastrom.eng.br') return;
  const caminho = url.pathname;
  if (IGNORAR.test(caminho) || caminho.startsWith('/admin') || caminho.startsWith('/api/') || vistos.has(caminho)) return;
  vistos.add(caminho);
  fila.push(caminho);
};

let baixados = 0;
while (fila.length) {
  const caminho = fila.shift();
  const resposta = await fetch(origem + caminho, { redirect: 'follow' });
  const tipo = resposta.headers.get('content-type') || '';
  if (resposta.status !== 200 && caminho !== '/404') { console.warn(`  pulado (${resposta.status}): ${caminho}`); continue; }
  let dados = Buffer.from(await resposta.arrayBuffer());
  // A chave do serviço de formulário não precisa ir para a cópia de testes: entra um valor de marcação no lugar.
  if (tipo.includes('text/html')) {
    dados = Buffer.from(dados.toString('utf8').replace(/(name="access_key" value=")[^"]+"/g, '$1chave-de-teste"'));
  }

  let arquivo = caminho;
  if (tipo.includes('text/html')) arquivo = caminho === '/' ? '/index.html' : `${caminho.replace(/\/$/, '')}.html`;
  const completo = join(destino, arquivo);
  await mkdir(dirname(completo), { recursive: true });
  await writeFile(completo, dados);
  baixados++;

  const texto = /html|css|xml|text|json|manifest/.test(tipo) ? dados.toString('utf8') : '';
  if (tipo.includes('text/html')) {
    for (const m of texto.matchAll(/(?:href|src|poster)="([^"#]+)"/g)) adicionar(m[1], origem + caminho);
  } else if (tipo.includes('css')) {
    for (const m of texto.matchAll(/url\(([^)]+)\)/g)) {
      const alvo = m[1].replace(/["']/g, '');
      if (!alvo.startsWith('data:') && !alvo.endsWith('.woff')) adicionar(alvo, origem + caminho);
    }
  } else if (tipo.includes('xml')) {
    for (const m of texto.matchAll(/<loc>([^<]+)<\/loc>/g)) adicionar(m[1], origem + caminho);
  } else if (caminho.endsWith('.webmanifest')) {
    for (const m of texto.matchAll(/"src":\s*"([^"]+)"/g)) adicionar(m[1], origem + caminho);
  }
}
console.log(`Pronto: ${baixados} arquivos em testes/fixtures/site (origem: ${origem}).`);
