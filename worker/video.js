// Código que roda na Cloudflare para os vídeos (.mp4) do site.
//
// Por quê: a hospedagem de arquivos estáticos da Cloudflare entrega o vídeo sempre inteiro e sem avisar que
// aceita "pedir um trecho" (HTTP Range). Sem isso o navegador não deixa o visitante avançar nem clicar num
// ponto da barra de tempo: ele só consegue tocar do início, na ordem. Este código atende o pedido de trecho
// (resposta 206 Partial Content) e avisa com "Accept-Ranges: bytes" que o pulo é possível.
//
// É o mesmo código que já estava publicado no Worker "kastrom"; só mudou de arquivo.

export async function servirVideo(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return env.ASSETS.fetch(request);

  // Pede o arquivo inteiro aos arquivos estáticos: tira o Range e o If-Range, que eles não entendem.
  const cabecalhosDoPedido = new Headers(request.headers);
  cabecalhosDoPedido.delete('Range');
  cabecalhosDoPedido.delete('If-Range');
  const arquivo = await env.ASSETS.fetch(new Request(request.url, { method: 'GET', headers: cabecalhosDoPedido }));
  if (arquivo.status !== 200) return arquivo; // 304 (sem mudança), 404 etc. seguem como vieram

  const cabecalhos = new Headers(arquivo.headers);
  cabecalhos.set('Accept-Ranges', 'bytes');

  const pedido = request.headers.get('Range');
  const ifRange = request.headers.get('If-Range');
  const etag = arquivo.headers.get('ETag');
  // Se o visitante já tem um pedaço de uma versão antiga do vídeo (If-Range diferente do ETag), manda o arquivo inteiro.
  const querTrecho = Boolean(pedido) && (!ifRange || (etag !== null && ifRange === etag));
  const semCorpo = request.method === 'HEAD';

  // Arquivo inteiro, sem pedido de trecho: entrega direto, sem carregar na memória.
  if (!querTrecho && !semCorpo) {
    return new Response(arquivo.body, { status: 200, headers: cabecalhos });
  }

  // Pedido de trecho (ou consulta só de cabeçalhos, HEAD): precisa saber o tamanho exato do arquivo.
  const dados = await arquivo.arrayBuffer();
  const total = dados.byteLength;
  const intervalo = querTrecho ? lerIntervalo(pedido, total) : 'ignorar';

  if (intervalo === 'ignorar') {
    cabecalhos.set('Content-Length', String(total));
    return new Response(semCorpo ? null : dados, { status: 200, headers: cabecalhos });
  }
  if (intervalo === 'impossivel') {
    cabecalhos.set('Content-Range', `bytes */${total}`);
    cabecalhos.set('Content-Length', '0');
    return new Response(null, { status: 416, headers: cabecalhos });
  }

  const { inicio, fim } = intervalo;
  cabecalhos.set('Content-Range', `bytes ${inicio}-${fim}/${total}`);
  cabecalhos.set('Content-Length', String(fim - inicio + 1));
  return new Response(semCorpo ? null : dados.slice(inicio, fim + 1), { status: 206, headers: cabecalhos });
}

// Lê "bytes=0-1023", "bytes=1000-" ou "bytes=-500".
// Devolve {inicio, fim}, 'impossivel' (começa depois do fim do arquivo: responder 416) ou
// 'ignorar' (formato que não entendemos, como vários trechos de uma vez: responder o arquivo inteiro).
export function lerIntervalo(texto, total) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(texto.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'ignorar';
  if (m[1] === '') {
    // "bytes=-500": os últimos 500 bytes
    const ultimos = Number(m[2]);
    if (ultimos === 0) return 'impossivel';
    return { inicio: Math.max(0, total - ultimos), fim: total - 1 };
  }
  const inicio = Number(m[1]);
  if (m[2] !== '' && Number(m[2]) < inicio) return 'ignorar';
  if (inicio >= total) return 'impossivel';
  const fim = m[2] === '' ? total - 1 : Math.min(Number(m[2]), total - 1);
  return { inicio, fim };
}
