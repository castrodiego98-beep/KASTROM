# Como colocar o painel no ar

O painel roda no mesmo Worker da Cloudflare que entrega o site. Colocá-lo no ar é juntar três coisas ao projeto do site e publicar:

1. a pasta do painel (`admin/`);
2. o código do Worker (`worker/`), que substitui o Worker atual e mantém a entrega dos vídeos;
3. um banco KV e dois segredos na Cloudflare.

Nada disso muda o que os visitantes veem. Enquanto ninguém publicar uma edição pelo painel, o site sai idêntico ao de hoje.

> **Antes de tudo:** o código-fonte do site não está neste repositório. Os passos abaixo são feitos no projeto do site (onde ficam `src/`, `public/`, `worker/index.js` e `deploy/cloudflare.config.ts`). Se o projeto for enviado para este repositório, a integração pode ser feita e testada aqui.

## 1. Copiar os arquivos

No projeto do site:

| Copie daqui | Para lá | Observação |
|---|---|---|
| `admin/` | `public/admin/` | O Astro copia `public/` para o site final sem alterar. O painel passa a existir em `/admin/` |
| `worker/` | `worker/` | Substitui o `worker/index.js` atual. O código dos vídeos foi mantido, em `worker/video.js` |

O Worker importa `admin/js/comum.js`. Com o painel em `public/admin/`, ajuste o caminho dos três `import` que apontam para `../../admin/js/comum.js` (em `worker/cms/`) para `../../public/admin/js/comum.js`.

## 2. Criar o banco KV

```bash
npx wrangler kv namespace create CMS
```

O comando mostra um `id`. Ele vai na configuração do Worker, como ligação chamada `CMS`.

## 3. Ajustar a configuração do Worker

Na configuração do site (`deploy/cloudflare.config.ts` ou `wrangler.jsonc`), o Worker precisa de:

- a ligação `ASSETS` com os arquivos do site (já existe);
- a ligação KV `CMS`, com o `id` do passo 2;
- o Worker atendendo primeiro as páginas, o painel, a API e a mídia.

O `wrangler.jsonc` deste repositório mostra o formato:

```jsonc
"assets": {
  "directory": "./dist",
  "binding": "ASSETS",
  "html_handling": "auto-trailing-slash",
  "not_found_handling": "404-page",
  "run_worker_first": ["/*", "!/_astro/*", "!/documentos/*", "!/admin/fontes/*", "!/*.png", "!/*.jpg", "!/*.ico", "!/*.svg", "!/*.webmanifest", "!/*.xml"]
},
"kv_namespaces": [{ "binding": "CMS", "id": "<id do passo 2>" }]
```

Hoje só os vídeos (`*.mp4`) passam pelo Worker. Com o painel, as páginas HTML também passam, para receber as edições. Fontes, imagens, CSS e PDFs continuam saindo direto.

**Custo.** No plano gratuito da Cloudflare cabem 100 mil execuções do Worker e 100 mil leituras do KV por dia. Cada página vista usa uma execução e, no máximo, uma leitura (o Worker guarda o conteúdo publicado na memória por alguns segundos). Para o volume de um site institucional, sobra.

## 4. Criar a senha e os segredos

Neste repositório:

```bash
npm run senha -- "uma frase longa, só sua, com pelo menos 12 caracteres"
```

O comando mostra dois valores. No projeto do site, grave cada um:

```bash
npx wrangler secret put CMS_SENHA_HASH
npx wrangler secret put CMS_SEGREDO
```

A senha em si não fica em arquivo nenhum. Guarde-a em um gerenciador de senhas.

## 5. Publicar e conferir

Publique o site como de costume. Depois:

1. Abra `/admin/`. Se faltar algo, a tela diz o quê.
2. Entre com a senha.
3. Rode a auditoria. Ela lê o site que está no ar.
4. Edite um texto, salve, abra "Ver o rascunho no site" e confira. Só então publique.

Para carregar as perguntas frequentes ampliadas e os títulos sugeridos: Configurações › Carregar cópia › `conteudo/rascunho-sugerido.json`. Revise cada resposta; as marcadas com `[CONFIRMAR]` precisam ser conferidas e a marca apagada antes de publicar.

## 6. Recomendado: uma segunda tranca

O painel tem senha própria. Para uma camada a mais, o Cloudflare Access (gratuito para até 50 pessoas) pode exigir login por e-mail antes mesmo de a tela de senha aparecer. Em Zero Trust › Access › Applications, crie uma aplicação para `kastrom.eng.br/admin*` e outra para `kastrom.eng.br/api/cms*`, liberadas só para os e-mails da equipe.

## 7. Vídeos da vitrine de projetos

Os vídeos de mockup saem do programa de 3D com 10 a 50 MB. O painel aceita até 10 MB por arquivo. Para reduzir uma pasta inteira e já gerar as capas (precisa do [FFmpeg](https://ffmpeg.org/download.html) instalado):

```bash
npm run videos -- "C:\caminho\Videos de Mockup 2026" "C:\caminho\videos-prontos"
```

Em nove amostras, 98,9 MB viraram 12,1 MB. Depois, na tela "Outros projetos", use "Enviar vídeo" em cada projeto.

Os arquivos ficam no mesmo KV do conteúdo. O plano gratuito tem 1 GB, o bastante para dezenas de vídeos já reduzidos. Se a biblioteca crescer muito, o destino certo passa a ser o Cloudflare R2.

## Como desfazer

- **Uma edição:** tela "Publicação" › Histórico › Restaurar, e publicar.
- **Todas as edições:** descartar o rascunho, apagar o que estiver editado e publicar. O site volta ao original.
- **O painel inteiro:** remover a ligação `CMS` da configuração e publicar. Sem o banco, o Worker entrega o site direto, como antes.

## Limites conhecidos

- Uma edição publicada leva até um minuto para aparecer em todos os lugares do mundo (tempo de propagação do KV).
- O painel edita textos que já existem na página e as seções que ele mesmo controla (perguntas frequentes e outros projetos). Novas seções e páginas dependem do código.
- A vitrine de projetos entra depois do bloco escuro do caso em destaque, na página inicial. Se esse bloco for removido do código, ela passa a entrar no fim da página.
- O botão "Ver outros projetos" entra ao lado do botão "Ver o caso do portfólio". Se esse botão sair do código, o atalho deixa de aparecer.
- Uma pessoa editando por vez: se o rascunho for alterado em outra aba, o painel recusa a gravação e pede para recarregar.
