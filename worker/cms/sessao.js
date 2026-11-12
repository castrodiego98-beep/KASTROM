// Entrada no painel: senha conferida com PBKDF2 e sessão guardada num cookie assinado (HMAC).
// Nada aqui depende de serviço externo; usa só a criptografia que já vem na Cloudflare (Web Crypto).

const DURACAO_SESSAO_S = 12 * 60 * 60; // 12 horas
const MAX_TENTATIVAS = 8;
const JANELA_TENTATIVAS_S = 15 * 60;
export const ITERACOES = 100000; // limite aceito pela Cloudflare Workers para PBKDF2

const codificador = new TextEncoder();

export function paraBase64Url(bytes) {
  let binario = '';
  for (const b of new Uint8Array(bytes)) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deBase64Url(texto) {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function iguais(a, b) {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a[i] ^ b[i];
  return diferenca === 0;
}

async function derivar(senha, sal, iteracoes) {
  const chave = await crypto.subtle.importKey('raw', codificador.encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes }, chave, 256);
  return new Uint8Array(bits);
}

/** Gera o valor que vai no segredo CMS_SENHA_HASH. Formato: pbkdf2-sha256$iterações$sal$hash */
export async function gerarHashDaSenha(senha) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(senha, sal, ITERACOES);
  return `pbkdf2-sha256$${ITERACOES}$${paraBase64Url(sal)}$${paraBase64Url(hash)}`;
}

export async function conferirSenha(senha, guardado) {
  const partes = String(guardado || '').split('$');
  if (partes.length !== 4 || partes[0] !== 'pbkdf2-sha256') return false;
  const iteracoes = Number(partes[1]);
  if (!Number.isInteger(iteracoes) || iteracoes < 1000 || iteracoes > ITERACOES) return false;
  try {
    const esperado = deBase64Url(partes[3]);
    const obtido = await derivar(String(senha), deBase64Url(partes[2]), iteracoes);
    return iguais(obtido, esperado);
  } catch {
    return false;
  }
}

async function chaveDeAssinatura(segredo) {
  return crypto.subtle.importKey('raw', codificador.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function criarFicha(segredo, agora = Date.now()) {
  const validade = Math.floor(agora / 1000) + DURACAO_SESSAO_S;
  const corpo = `v1.${validade}`;
  const assinatura = await crypto.subtle.sign('HMAC', await chaveDeAssinatura(segredo), codificador.encode(corpo));
  return `${corpo}.${paraBase64Url(assinatura)}`;
}

export async function fichaValida(ficha, segredo, agora = Date.now()) {
  const partes = String(ficha || '').split('.');
  if (partes.length !== 3 || partes[0] !== 'v1') return false;
  const validade = Number(partes[1]);
  if (!Number.isInteger(validade) || validade * 1000 < agora) return false;
  try {
    return await crypto.subtle.verify('HMAC', await chaveDeAssinatura(segredo), deBase64Url(partes[2]), codificador.encode(`${partes[0]}.${partes[1]}`));
  } catch {
    return false;
  }
}

// Em produção (https) o cookie usa o prefixo "__Host-", que o navegador só aceita com Secure e sem domínio.
function nomeDoCookie(url) {
  return url.protocol === 'https:' ? '__Host-kastrom_cms' : 'kastrom_cms';
}

function lerCookie(request, nome) {
  for (const parte of (request.headers.get('Cookie') || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
  }
  return null;
}

export function cookieDeSessao(url, ficha) {
  const seguro = url.protocol === 'https:' ? ' Secure;' : '';
  return `${nomeDoCookie(url)}=${ficha}; Path=/; HttpOnly;${seguro} SameSite=Strict; Max-Age=${DURACAO_SESSAO_S}`;
}

export function cookieDeSaida(url) {
  const seguro = url.protocol === 'https:' ? ' Secure;' : '';
  return `${nomeDoCookie(url)}=; Path=/; HttpOnly;${seguro} SameSite=Strict; Max-Age=0`;
}

/** O que falta configurar na Cloudflare para o painel funcionar (lista vazia = tudo certo). */
export function oQueFalta(env) {
  const falta = [];
  if (!env.CMS) falta.push('CMS');
  if (!env.CMS_SENHA_HASH) falta.push('CMS_SENHA_HASH');
  if (!env.CMS_SEGREDO || String(env.CMS_SEGREDO).length < 32) falta.push('CMS_SEGREDO');
  return falta;
}

export async function sessaoValida(request, env) {
  if (oQueFalta(env).length) return false;
  const url = new URL(request.url);
  return fichaValida(lerCookie(request, nomeDoCookie(url)), env.CMS_SEGREDO);
}

function enderecoDoVisitante(request) {
  return request.headers.get('CF-Connecting-IP') || 'desconhecido';
}

/** Confere a senha, com trava contra tentativas em série. Devolve { ok, status, erro?, cookie? }. */
export async function entrar(request, env, senha) {
  const url = new URL(request.url);
  const chave = `tentativas:${enderecoDoVisitante(request)}`;
  const tentativas = Number(await env.CMS.get(chave)) || 0;
  if (tentativas >= MAX_TENTATIVAS) {
    return { ok: false, status: 429, erro: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' };
  }
  if (typeof senha !== 'string' || !senha || senha.length > 500 || !(await conferirSenha(senha, env.CMS_SENHA_HASH))) {
    await env.CMS.put(chave, String(tentativas + 1), { expirationTtl: JANELA_TENTATIVAS_S });
    return { ok: false, status: 401, erro: 'Senha incorreta.' };
  }
  if (tentativas) await env.CMS.delete(chave);
  return { ok: true, status: 200, cookie: cookieDeSessao(url, await criarFicha(env.CMS_SEGREDO)) };
}
