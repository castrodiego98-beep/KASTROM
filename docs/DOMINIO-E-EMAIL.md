# Ligar o domínio à Cloudflare e corrigir o e-mail

Situação em 12/11/2026, conferida no DNS público:

| Registro de `kastrom.eng.br` | Valor hoje | O que significa |
|---|---|---|
| Servidores DNS (NS) | `a.auto.dns.br`, `b.auto.dns.br` | O DNS está no Registro.br |
| Endereço (A / AAAA) | `200.160.2.95` / `2001:12ff:0:2::95` (`r.registro.br`) | O domínio aponta para o serviço de redirecionamento do Registro.br, não para o site |
| `www` | apelido de `kastrom.eng.br` | Idem |
| E-mail (MX) | só `alt2.aspmx.l.google.com` | Um único servidor do Google, e é um dos secundários |
| SPF, DKIM, DMARC | não existem | Mensagens de `@kastrom.eng.br` podem ser tratadas como suspeitas |
| DNSSEC (DS) | ativo | **Precisa sair antes ou junto com a troca de servidores DNS** |
| CAA | `0 issue "letsencrypt.org"` | Só o Let's Encrypt pode emitir certificado; pode ser apagado na Cloudflare |

O trabalho tem três partes: preparar o domínio na Cloudflare, trocar os servidores DNS no Registro.br e ligar o domínio ao site. Leva cerca de uma hora de trabalho, mais a espera da propagação.

**O e-mail é o único ponto delicado.** Enquanto a troca acontece, mensagens recebidas podem atrasar (os servidores de quem envia tentam de novo por dias, então não se perdem). Faça fora do horário comercial.

## Parte 1: preparar na Cloudflare (nada muda para o público)

1. Entre em `dash.cloudflare.com`, na mesma conta onde está o Worker `kastrom`.
2. **Adicionar domínio** › digite `kastrom.eng.br` › plano **Free**.
3. A Cloudflare lê os registros DNS atuais e mostra uma lista. Ajuste assim:

   | Registro | O que fazer |
   |---|---|
   | `A` e `AAAA` de `kastrom.eng.br` (200.160.2.95 e 2001:12ff:0:2::95) | **Apagar.** São do redirecionamento do Registro.br; o site passa a ser ligado na parte 3 |
   | `CNAME` de `www` | **Apagar.** É recriado na parte 3 |
   | `CAA` | **Apagar.** A Cloudflare cria os que precisa |
   | `MX` | **Manter e completar** (passo 4) |

4. E-mail. Confirme antes, no Google Admin (`admin.google.com`), que o e-mail da empresa é mesmo do Google Workspace. Sendo, deixe os registros assim:

   | Tipo | Nome | Valor | Prioridade |
   |---|---|---|---|
   | MX | `@` | `smtp.google.com` | 1 |
   | TXT | `@` | `v=spf1 include:_spf.google.com ~all` | |
   | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:gabriel@kastrom.eng.br` | |

   O registro MX único `smtp.google.com` é o formato atual do Google Workspace e substitui o `alt2.aspmx.l.google.com`. Se a conta for antiga e o Google Admin mostrar os cinco registros `aspmx`, use os que ele mostrar.

   Se algum outro serviço enviar e-mail em nome do domínio (sistema de notas fiscais, ferramenta de e-mail marketing), ele precisa entrar no SPF. O formulário do site não entra: o Web3Forms envia do domínio dele.

5. Anote os **dois servidores DNS** que a Cloudflare mostra no fim (algo como `nome.ns.cloudflare.com`). O domínio fica "pendente" até a parte 2.

## Parte 2: trocar os servidores DNS no Registro.br

6. Entre em `registro.br` com a conta titular do domínio › **Domínios** › `kastrom.eng.br` › **DNS** › **Alterar servidores DNS**.
7. Troque `a.auto.dns.br` e `b.auto.dns.br` pelos dois servidores da Cloudflare.
8. **DNSSEC:** deixe os campos de **DS** em branco. Se o registro DS antigo continuar depois da troca, o domínio para de resolver (site e e-mail). O Registro.br valida os novos servidores antes de aceitar; se recusar, confira se digitou os nomes exatamente como a Cloudflare mostrou.
9. Aguarde. A troca costuma aparecer em até 2 horas; o registro DS antigo vale por mais 1 hora nos caches. A Cloudflare manda um e-mail quando o domínio fica **Ativo**.

## Parte 3: ligar o domínio ao site

10. Na Cloudflare: **Workers & Pages** › `kastrom` › **Domínios** (ou Configurações › Domínios e rotas) › **Adicionar** › **Domínio personalizado** › `kastrom.eng.br`. O registro DNS e o certificado HTTPS são criados sozinhos, em poucos minutos.
11. Para o `www`: crie um registro DNS `AAAA`, nome `www`, valor `100::`, com o proxy (nuvem laranja) ligado. Depois, em **Regras** › **Regras de redirecionamento**, use o modelo **Redirecionar de WWW para a raiz**.
12. Teste no navegador: `https://kastrom.eng.br` e `https://www.kastrom.eng.br` devem abrir o site, com cadeado.
13. Confira o `noindex`: a resposta de `https://kastrom.eng.br/` **não** pode trazer o cabeçalho `x-robots-tag`. Se trouxer, o arquivo `public/_headers` do projeto do site está aplicando a regra a todos os endereços; ela precisa valer só para o endereço provisório:

    ```txt
    https://kastrom.kastrom.workers.dev/*
      X-Robots-Tag: noindex
    ```

## Parte 4: terminar o e-mail (DKIM) e endurecer

14. No Google Admin: **Apps** › **Google Workspace** › **Gmail** › **Autenticar e-mail** › **Gerar novo registro**. Ele mostra um registro TXT com o nome `google._domainkey`. Crie esse registro na Cloudflare, espere alguns minutos e clique em **Iniciar autenticação**.
15. Envie um e-mail de `gabriel@kastrom.eng.br` para uma conta do Gmail. Em "Mostrar original", SPF, DKIM e DMARC devem aparecer como **PASS**.
16. Depois de duas a quatro semanas sem problemas, troque `p=none` por `p=quarantine` no registro `_dmarc`. A partir daí, mensagens forjadas em nome do domínio vão para o spam de quem as recebe.
17. Opcional: reativar o DNSSEC. Na Cloudflare, **DNS** › **Configurações** › **Ativar DNSSEC**; ela mostra um registro DS, que vai no mesmo campo do Registro.br deixado em branco no passo 8.

## Depois

- Google Search Console: adicionar a propriedade `kastrom.eng.br` (a verificação por DNS é um registro TXT na Cloudflare) e enviar `https://kastrom.eng.br/sitemap-index.xml`.
- Netlify: apagar o projeto `kastrom`, que serve uma versão antiga do site.
- No Registro.br, o redirecionamento web deixa de ter efeito; não é preciso desligar nada.

## Se algo der errado

- **O domínio parou de resolver logo após a troca:** quase sempre é o DS antigo. Confira no Registro.br se os campos de DS estão vazios e aguarde 1 hora.
- **O e-mail parou de chegar:** confira o registro MX na Cloudflare. As mensagens enviadas no intervalo são reentregues sozinhas.
- **Voltar atrás:** no Registro.br, escolher de novo "usar os servidores DNS do Registro.br". Tudo volta a ser como hoje.
