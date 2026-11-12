// Prepara o ambiente local: junta a cópia do site (testes/fixtures/site) com o painel (admin/) na pasta
// .dev/site, que é a pasta que o "wrangler dev" entrega. Também cria o arquivo .dev.vars com uma senha
// de desenvolvimento, se ele ainda não existir.

import { cp, mkdir, rm, writeFile, access, readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gerarHashDaSenha, paraBase64Url } from '../worker/cms/sessao.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const destino = join(raiz, '.dev', 'site');
export const SENHA_DEV = 'kastrom-desenvolvimento';

await rm(destino, { recursive: true, force: true });
await mkdir(destino, { recursive: true });
await cp(join(raiz, 'testes', 'fixtures', 'site'), destino, { recursive: true });
await cp(join(raiz, 'admin'), join(destino, 'admin'), { recursive: true });

// PDFs e vídeos não fazem parte da cópia (são grandes). Para os links não ficarem quebrados no ambiente
// local, cada um ganha um arquivo de marcação no lugar.
for (const nome of (await readdir(destino)).filter((n) => n.endsWith('.html'))) {
  const html = await readFile(join(destino, nome), 'utf8');
  for (const [, alvo] of html.matchAll(/(?:href|src)="(\/[^"?#]+\.(?:pdf|mp4))"/g)) {
    const arquivo = join(destino, alvo);
    try { await access(arquivo); } catch {
      await mkdir(dirname(arquivo), { recursive: true });
      await writeFile(arquivo, 'Arquivo de marcação: o original não é copiado para o ambiente local.\n');
    }
  }
}

const variaveis = join(raiz, '.dev.vars');
try {
  await access(variaveis);
} catch {
  const segredo = paraBase64Url(crypto.getRandomValues(new Uint8Array(48)));
  await writeFile(variaveis, `CMS_SENHA_HASH="${await gerarHashDaSenha(SENHA_DEV)}"\nCMS_SEGREDO="${segredo}"\n`);
  console.log(`Criado .dev.vars. Senha do painel neste computador: ${SENHA_DEV}`);
}
console.log('Ambiente local pronto em .dev/site. Painel: http://localhost:8787/admin/');
