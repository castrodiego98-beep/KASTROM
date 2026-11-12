// Conversa com a API do painel (/api/cms/...), que roda no Worker da Cloudflare.

export class ErroApi extends Error {
  constructor(mensagem, status, dados) {
    super(mensagem);
    this.status = status;
    this.dados = dados || {};
  }
}

export async function api(caminho, { metodo = 'GET', corpo } = {}) {
  let resposta;
  try {
    resposta = await fetch(`/api/cms${caminho}`, {
      method: metodo,
      headers: corpo === undefined ? {} : { 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ErroApi('Sem conexão com o servidor. Confira a internet e tente de novo.', 0);
  }
  let dados = {};
  try { dados = await resposta.json(); } catch { /* resposta sem JSON */ }
  if (!resposta.ok) throw new ErroApi(dados.erro || `Erro ${resposta.status}.`, resposta.status, dados);
  return dados;
}
