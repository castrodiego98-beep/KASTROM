// Roda os testes de ponta a ponta: sobe o Worker de verdade no computador (wrangler dev), com um banco
// vazio só para o teste, e exercita a API, a camada de edição e o painel no navegador.
// Uso: npm run test:e2e

import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testarApi } from './api.teste.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORTA = 8791;
const base = `http://localhost:${PORTA}`;
const SENHA = 'kastrom-desenvolvimento';
const estado = join(raiz, '.dev', 'estado-teste');

await rm(estado, { recursive: true, force: true });
const servidor = spawn('npx', ['wrangler', 'dev', '--port', String(PORTA), '--persist-to', estado], {
  cwd: raiz,
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let saida = '';
servidor.stdout.on('data', (d) => { saida += d; });
servidor.stderr.on('data', (d) => { saida += d; });
const parar = () => { try { process.kill(-servidor.pid, 'SIGTERM'); } catch { /* já parou */ } };

let codigo = 0;
let total = 0;
try {
  let pronto = false;
  for (let i = 0; i < 90 && !pronto; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { pronto = (await fetch(`${base}/api/cms/sessao`)).ok; } catch { /* ainda subindo */ }
  }
  if (!pronto) throw new Error('O servidor local não subiu.\n' + saida.slice(-2000));
  const relatar = (nome) => console.log(`  ✓ ${String(++total).padStart(2)}. ${nome}`);

  console.log('API e camada de edição');
  await testarApi(base, SENHA, relatar);

  let testarPainel = null;
  try { ({ testarPainel } = await import('./painel.teste.mjs')); } catch (erro) {
    if (erro.code !== 'ERR_MODULE_NOT_FOUND') throw erro;
  }
  if (testarPainel) {
    console.log('Painel no navegador');
    await testarPainel(base, SENHA, relatar);
  }
  console.log(`\n${total} verificações passaram.`);
} catch (erro) {
  codigo = 1;
  console.error('\n✗ FALHOU:', erro?.stack || erro);
} finally {
  parar();
}
process.exit(codigo);
