// Gera os dois segredos que o painel precisa na Cloudflare.
// Uso: npm run senha -- "a senha que você escolher"
// Depois, grave cada valor com:  npx wrangler secret put CMS_SENHA_HASH   e   npx wrangler secret put CMS_SEGREDO

import { gerarHashDaSenha, paraBase64Url } from '../worker/cms/sessao.js';

const senha = process.argv[2];
if (!senha || senha.length < 12) {
  console.error('Informe uma senha com pelo menos 12 caracteres. Exemplo: npm run senha -- "frase longa e só sua"');
  process.exit(1);
}
console.log('CMS_SENHA_HASH=' + (await gerarHashDaSenha(senha)));
console.log('CMS_SEGREDO=' + paraBase64Url(crypto.getRandomValues(new Uint8Array(48))));
console.log('\nGuarde a senha com você: ela não aparece em nenhum arquivo, só o código embaralhado acima.');
