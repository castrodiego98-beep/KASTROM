// Prepara vídeos de mockup para o site: reduz o tamanho, tira o som e gera a imagem de capa de cada um.
//
// Uso:  npm run videos -- "pasta com os originais" "pasta de destino"
//
// Precisa do programa gratuito FFmpeg instalado (https://ffmpeg.org/download.html). Se ele não estiver no
// caminho do sistema, informe onde está:  FFMPEG="C:\ffmpeg\bin\ffmpeg.exe" npm run videos -- origem destino
//
// O que sai, para cada vídeo:  nome.mp4 (H.264, até 1280 px de largura, sem som, pronto para tocar na web)
//                              nome.jpg (capa, tirada de 1 segundo depois do início)
// Os originais não são alterados.

import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const [origem, destino] = process.argv.slice(2);
if (!origem || !destino) {
  console.error('Uso: npm run videos -- "pasta com os originais" "pasta de destino"');
  process.exit(1);
}
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
if (spawnSync(ffmpeg, ['-version']).status !== 0) {
  console.error('Não encontrei o FFmpeg. Instale-o (https://ffmpeg.org/download.html) ou informe o caminho na variável FFMPEG.');
  process.exit(1);
}

const LIMITE = 10 * 1024 * 1024; // o painel aceita até 10 MB por arquivo
const megas = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
const nomeLimpo = (arquivo) => basename(arquivo, extname(arquivo)).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

mkdirSync(destino, { recursive: true });
const videos = readdirSync(origem).filter((n) => /\.(mp4|mov|mpg|mpeg|avi|mkv|webm|m4v)$/i.test(n)).sort();
if (!videos.length) { console.error(`Nenhum vídeo encontrado em "${origem}".`); process.exit(1); }

let antes = 0;
let depois = 0;
for (const nome of videos) {
  const entrada = join(origem, nome);
  const saida = join(destino, `${nomeLimpo(nome)}.mp4`);
  const capa = join(destino, `${nomeLimpo(nome)}.jpg`);
  // -crf 27: qualidade visual boa para animação 3D; scale: no máximo 1280 px de largura, medidas pares;
  // -an: sem som; +faststart: o vídeo começa a tocar antes de terminar de baixar.
  const video = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', entrada,
    '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p',
    '-an', '-movflags', '+faststart', saida], { encoding: 'utf8' });
  if (video.status !== 0) { console.error(`  ✗ ${nome}: ${video.stderr.trim().split('\n').pop()}`); continue; }
  spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '1', '-i', saida, '-frames:v', '1', '-q:v', '4', capa]);
  const a = statSync(entrada).size;
  const d = statSync(saida).size;
  antes += a;
  depois += d;
  console.log(`  ✓ ${nome}: ${megas(a)} → ${megas(d)}${d > LIMITE ? '  (ainda acima de 10 MB: corte o vídeo ou reduza a duração)' : ''}`);
}
console.log(`\n${videos.length} vídeos: ${megas(antes)} → ${megas(depois)}. Arquivos prontos em "${destino}".`);
