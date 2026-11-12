# Auditoria e QA do site da KAS-Trom

Site auditado: `https://kastrom.kastrom.workers.dev/` (6 páginas no sitemap, mais `/obrigado` e a página 404).
Data: 11 e 12 de novembro de 2026.

## Como foi feito

- Leitura do HTML, CSS, scripts, cabeçalhos HTTP, `robots.txt`, sitemap, `llms.txt`, manifesto e dados estruturados de todas as páginas.
- Leitura do código do Worker publicado na Cloudflare (`kastrom`).
- Navegador de verdade (Chromium via Playwright) em 8 páginas × 4 larguras (1440, 768, 390 e 320 px): erros de console, pedidos que falham, rolagem lateral, tamanho das áreas de toque.
- axe-core (WCAG 2.0, 2.1 e 2.2, níveis A e AA) em 8 páginas × 2 larguras, com todas as sanfonas abertas.
- Lighthouse em 3 páginas (início, portfólio, contato), celular e computador.
- Testes de interação: menu do celular, teclado, formulário (sem enviar), sem JavaScript, impressão, texto a 200%.
- Hospedagens: consulta ao DNS de `kastrom.eng.br`, às contas da Cloudflare, Netlify e Vercel ligadas a esta sessão, e comparação das cópias do site em cada uma.

O que **não** foi possível verificar está no fim do documento.

## Placar

| Área | Situação | Ponto principal |
|---|---|---|
| Hospedagem e domínio | **Crítica** | `kastrom.eng.br` não aponta para o site e não abre em HTTPS; há uma cópia antiga e indexável na Netlify |
| Desempenho | Excelente | Lighthouse 100 em todas as páginas medidas; LCP de 0,9 s no celular; páginas de 99 a 362 KB |
| Acessibilidade | Excelente | Lighthouse 100; axe-core sem nenhuma violação em 16 combinações |
| Segurança | Muito boa | CSP, HSTS, proteção contra molduras, política de permissões, sem cookies nem terceiros |
| SEO técnico | Boa no site, bloqueada pelo domínio | Tudo no lugar (canonical, sitemap, Open Graph, dados estruturados), mas todos os endereços oficiais apontam para um domínio que não entrega o site |
| GEO (assistentes de IA) | Boa base | `llms.txt` bem feito e robôs de IA liberados; faltam perfis oficiais e autoria |
| AEO (respostas diretas) | Fraca | Só 4 perguntas frequentes, numa única página (há um rascunho com 13 pronto para revisão) |
| Conteúdo | Bem escrito, raso | Páginas de serviços e "sobre" com cerca de 260 palavras; ninguém assina o trabalho |
| Código | Limpo | Dois defeitos reais de HTML/CSS e um ponto de custo no vídeo |
| Operação | Em risco | O código-fonte do site não está no GitHub; não há medição de visitas |

## Prioridades

Em ordem. A coluna "Onde" diz quem resolve: **painel** (o CMS deste repositório), **código** (o projeto Astro do site), **texto** (redação), **DNS** (Registro.br e Cloudflare) ou **fora** (outro serviço).

| # | O que fazer | Por quê | Onde |
|---|---|---|---|
| 1 | Ligar `kastrom.eng.br` ao site na Cloudflare, com HTTPS | Hoje o domínio aponta para um servidor do Registro.br e o certificado HTTPS é inválido. Todos os endereços que o site declara como oficiais (canonical, sitemap, imagem de compartilhamento, `llms.txt`) usam `https://kastrom.eng.br`, então nada disso funciona para o Google nem para quem recebe um link | DNS |
| 2 | Completar o DNS de e-mail (MX, SPF, DKIM, DMARC) | Há um único registro MX e nenhum SPF nem DMARC: respostas enviadas de `gabriel@kastrom.eng.br` tendem a cair em spam, e qualquer pessoa pode forjar o remetente | DNS |
| 3 | Tirar do ar (ou bloquear para buscadores) a cópia em `kastrom.netlify.app` | É uma versão antiga do site, sem `noindex`, com títulos antigos, sem `llms.txt` e com os quatro PDFs do portfólio dando erro 404 | fora |
| 4 | Enviar `X-Robots-Tag: noindex` só no endereço `workers.dev` | Quando o domínio oficial passar a usar o mesmo Worker, o cabeçalho não pode ir junto, ou o site fica invisível no Google | código |
| 5 | Guardar o código-fonte do site no GitHub | O repositório estava vazio. O site existe só no computador de quem publicou e, já compilado, na Cloudflare | fora |
| 6 | Revisar e publicar as perguntas frequentes ampliadas, incluindo a do acordo de confidencialidade (NDA) | De 4 para 13 perguntas. O rascunho está em `conteudo/rascunho-sugerido.json` | painel |
| 7 | Montar a vitrine "Outros projetos" na página inicial | Há 61 vídeos de mockup prontos. Antes, decidir quais projetos podem ser mostrados e ajustar as frases do site que dizem que a empresa não divulga outros projetos | painel |
| 8 | Dizer quem é o responsável técnico (nome, formação, registro profissional) na página "Sobre" | Em engenharia e patentes, quem assina é o principal sinal de confiança, para clientes e para assistentes de IA. Hoje "Gabriel" aparece só no e-mail | texto + código |
| 9 | Cadastrar perfis oficiais (LinkedIn, Google Perfil da Empresa, página do pedido no INPI) | Liga a empresa às suas páginas em outros sites (`sameAs`); hoje não há nenhum | painel |
| 10 | Aprofundar a página de serviços, de preferência com uma página por frente de serviço | 261 palavras para 11 serviços, todos escondidos em sanfonas de uma frase; os três cartões da página inicial levam ao mesmo endereço | texto + código |
| 11 | Corrigir o menu do celular sem JavaScript | Sem JavaScript, o menu não aparece e o botão some: resta só o rodapé para navegar | código |
| 12 | Trocar `preload="metadata"` por `preload="none"` no vídeo da página inicial | Cada visita à página inicial faz o Worker carregar o vídeo inteiro (8,6 MB) na memória | código |
| 13 | Ajustar títulos e descrições fora da faixa ideal | Contato (27 caracteres), Sobre (35), Serviços (61) e descrição da Privacidade (85). As sugestões estão no mesmo rascunho do item 6 | painel |
| 14 | Dizer o prazo de resposta na página de contato | "Respondemos por e-mail" não diz quando | painel |
| 15 | Completar a política de privacidade com base legal e prazo de guarda | A LGPD pede as duas informações | painel |
| 16 | Medir visitas e buscas | Sem dados não dá para saber o que traz contatos. Google Search Console não exige nada no site; Cloudflare Web Analytics mede sem cookies | fora |
| 17 | Incluir trilha de navegação (`BreadcrumbList`) nas páginas internas | Ajuda buscadores e assistentes a entender a estrutura do site | código |
| 18 | Mover os scripts que ficaram depois de `</html>` | HTML inválido na página inicial e no contato | código |
| 19 | Gerar AVIF/WebP e `srcset` para as imagens grandes | Economia de 60 a 90 KB por página, segundo o Lighthouse | código |

Os itens marcados "painel" podem ser feitos sem tocar no código, depois que o painel estiver instalado (veja `docs/INTEGRACAO.md`).

## Hospedagens e domínio

O site está em três lugares, e nenhum deles é o endereço oficial.

| Lugar | O que há lá | Situação |
|---|---|---|
| **`kastrom.eng.br`** (domínio oficial) | DNS no Registro.br (`a.auto.dns.br`, `b.auto.dns.br`). O domínio aponta para `200.160.2.95` (`r.registro.br`), um servidor do próprio Registro.br, e não para a Cloudflare nem para a Netlify | **Não entrega o site.** Em HTTPS o certificado é inválido; em `www.kastrom.eng.br` a conexão é recusada |
| **Cloudflare** `kastrom.kastrom.workers.dev` | Worker `kastrom` (criado em 02/11/2026, atualizado em 05/11/2026) com a versão atual do site (Astro 7.4.5) | No ar e correto, com `noindex` (endereço provisório). Sem domínio próprio ligado, sem banco KV e sem R2 |
| **Netlify** `kastrom.netlify.app` | Projeto `kastrom` com uma versão anterior (Astro 7.4.4) | **Indexável e desatualizado**: títulos antigos, endereços oficiais terminando em `.html`, sem `llms.txt`, os quatro PDFs do portfólio com erro 404, formulário pelo Netlify Forms |
| **Vercel** | A conta está ligada, mas sem permissão para listar projetos nesta sessão; nenhum domínio cadastrado | Não verificado |

**E-mail.** O domínio tem um único registro MX (`alt2.aspmx.l.google.com`, um dos servidores secundários do Google) e nenhum registro SPF nem DMARC. O recebimento funciona enquanto aquele servidor responder; o envio é o problema: sem SPF, DKIM e DMARC, o Gmail e o Outlook tratam as mensagens de `@kastrom.eng.br` como suspeitas. Para uma empresa que atende só por e-mail, isso custa contatos.

**Recomendação: ficar só com a Cloudflare.** É onde já está a versão atual e onde roda o Worker (e o painel deste repositório). O caminho:

1. Na Cloudflare, adicionar o domínio `kastrom.eng.br` (plano gratuito). Ela lista os registros DNS existentes; **confira que o MX foi copiado** antes de seguir, para o e-mail não parar.
2. Aproveitar para corrigir o e-mail: os registros MX atuais do Google Workspace, SPF (`v=spf1 include:_spf.google.com ~all`), DKIM (gerado no painel do Google Workspace) e DMARC (comece com `v=DMARC1; p=none; rua=mailto:...`).
3. No Registro.br, trocar os servidores DNS do domínio pelos dois que a Cloudflare informar.
4. No Worker `kastrom`, ligar o domínio `kastrom.eng.br` (Domínios personalizados) e redirecionar `www` para ele. O certificado HTTPS é emitido automaticamente.
5. Ajustar o `noindex` para valer só em `workers.dev` (prioridade 4).
6. Conferir: `curl -sI https://kastrom.eng.br/` deve responder 200, sem `x-robots-tag`.
7. Cadastrar o domínio no Google Search Console e enviar `https://kastrom.eng.br/sitemap-index.xml`.
8. Apagar o projeto da Netlify, ou deixá-lo com `noindex` e redirecionando para o domínio oficial.

Os passos 1 a 4 mexem no DNS e no e-mail da empresa; por isso não foram feitos nesta auditoria.

## O que já está muito bom

Vale registrar, porque é raro e não deve ser desfeito:

- **Peso e velocidade.** Site estático, sem framework de JavaScript no navegador, fontes hospedadas no próprio site e pré-carregadas, um único CSS de 40 KB. Página inicial com 362 KB no total.
- **Acessibilidade.** Link "pular para o conteúdo", foco visível, rótulos em todos os campos, texto alternativo descritivo nas imagens, descrição textual do vídeo, menu que fecha com Esc e devolve o foco, cabeçalho que reaparece ao receber foco, texto a 200% sem rolagem lateral.
- **Privacidade.** Sem cookies, sem rastreadores, sem requisições a terceiros além do envio do formulário.
- **Honestidade do conteúdo.** "É um pedido de patente; não há patente concedida", "animação em 3D, não é filmagem de campo", "não divulgamos clientes". Esse cuidado é um diferencial e também protege a empresa.
- **Siglas explicadas** (TRL, PDI) na própria página: bom para leitores e para assistentes de IA.
- **`llms.txt`** com resumo, páginas e "fatos de referência" conferíveis.

## Tecnologia

**O que é.** Astro 7.4.5 gerando HTML estático, Tailwind CSS 4, IBM Plex (Sans e Mono) em WOFF2, hospedagem em Cloudflare Workers com arquivos estáticos e um Worker pequeno só para os vídeos. Formulário enviado ao Web3Forms.

| Achado | Gravidade | Recomendação |
|---|---|---|
| O Worker de vídeo carrega o arquivo inteiro na memória (`arrayBuffer()`) a cada pedido de trecho. Na página inicial o vídeo usa `preload="metadata"`, então **toda visita** dispara um pedido `Range: bytes=0-` e o Worker lê os 8,6 MB | Média | `preload="none"` na página inicial (a capa já existe). A médio prazo, hospedar o vídeo no Cloudflare R2 ou Stream, que entregam trechos nativamente |
| O código-fonte não está versionado no GitHub | Alta | Subir o projeto Astro para o repositório e publicar por ele (Workers Builds) |
| Sem medição de visitas nem de erros | Média | Search Console + Cloudflare Web Analytics (sem cookies; exige atualizar a CSP e a política de privacidade) |
| O formulário depende de um serviço gratuito de terceiros, com a chave no HTML | Baixa | É o funcionamento normal do Web3Forms e há o e-mail como alternativa. Se o volume crescer, um endpoint próprio no Worker com Turnstile dá mais controle |
| `script-src 'unsafe-inline'` na CSP | Baixa | Necessário porque o Astro embute scripts pequenos; dá para trocar por hashes |
| HSTS sem `includeSubDomains` | Baixa | Acrescentar quando todos os subdomínios estiverem em HTTPS |
| Sem `/.well-known/security.txt` | Baixa | Opcional |

Cabeçalhos conferidos e corretos: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`. Cache: HTML sempre revalidado; arquivos com nome versionado por 1 ano; imagens por 7 dias.

## Código

| Achado | Onde | Correção |
|---|---|---|
| **Menu do celular some sem JavaScript.** O `<noscript>` tenta mostrar o menu com `#menu-celular{display:block!important}`, mas o Tailwind 4 define `[hidden]{display:none!important}` dentro de uma camada (`@layer base`), e regras `!important` em camadas vencem as de fora. Resultado medido: menu invisível e botão escondido | Cabeçalho, todas as páginas | Entregar o menu sem o atributo `hidden` e deixar o script escondê-lo ao carregar |
| **Scripts depois de `</html>`.** 290 caracteres na página inicial e 837 no contato | `index.astro`, `contato.astro` | Colocar o `<script>` da página dentro do layout, antes de `</body>` |
| Formulário sem destino para quem está sem JavaScript: o envio direto termina na página padrão do Web3Forms | Contato | Acrescentar `<input type="hidden" name="redirect" value="https://kastrom.eng.br/obrigado">` |
| Vídeo sem faixa de legenda | Início e portfólio | Só é necessário se o vídeo tiver narração ou texto falado |
| Identificadores com acento (`#sigilo-e-números`) | Sobre, privacidade | Funciona; sem acento os links ficam mais fáceis de copiar |
| Cabeçalho continua `sticky` na impressão | Todas | `position: static` em `@media print` |

Os dois primeiros foram confirmados em teste, não são suposição.

## UX

- **Página inicial.** Hierarquia clara e chamada visível na primeira tela, inclusive em 320 px. Os três cartões "três frentes" são só títulos e todos levam a `/servicos`: o visitante clica em "Suporte em propriedade industrial" e cai no topo de uma página genérica.
- **Serviços.** Onze sanfonas, cada uma com uma frase. Abrir onze itens para ler onze frases é mais trabalho do que ler um parágrafo. Mostrar o texto aberto ou, melhor, escrever mais em cada um.
- **Portfólio.** O ponto forte do site. Os links "Ver documento" abrem PDFs de 2,2 a 5,6 MB em nova aba sem avisar o tamanho; no celular, isso pesa. Indicar "(PDF, 4,6 MB)" no link.
- **Contato.** Formulário curto, rótulos claros, aviso de sigilo antes dos campos, página de confirmação. Falta dizer o prazo de resposta. A mensagem de erro de envio é genérica, mas oferece o e-mail.
- **Navegação.** Menu de quatro itens, rodapé repetindo os mesmos links. Não há link para um perfil no LinkedIn nem outro lugar onde conferir a empresa.
- **Áreas de toque.** No celular, todas com 44 px ou mais, exceto links dentro de frases (20 a 23 px de altura, o que a WCAG 2.2 admite).

## SEO

**No lugar:** um H1 por página, títulos em ordem, canonical em todas as páginas, sitemap com data, `robots.txt` apontando o sitemap, Open Graph completo com imagem 1200×630, página 404 respondendo 404, `/obrigado` fora do índice e do sitemap, redirecionamento de `/servicos/` e `/servicos.html` para `/servicos`.

| Achado | Recomendação |
|---|---|
| Todas as respostas do endereço auditado trazem `X-Robots-Tag: noindex` (por isso o Lighthouse dá 69 em SEO) | Correto para um endereço provisório; não pode ir para o domínio oficial (prioridade 4) |
| Canonical, sitemap, `robots.txt` e `llms.txt` apontam para `kastrom.eng.br`, que hoje não entrega o site | Ligar o domínio (prioridade 1). Até lá, o site não tem como ser indexado no endereço que declara |
| A cópia na Netlify é indexável e declara endereços oficiais terminando em `.html` | Tirar do ar (prioridade 3) |
| Título do contato com 27 caracteres ("Contato \| KAS-Trom Projetos") | Algo como "Contato: fale sobre seu projeto ou patente \| KAS-Trom" |
| Título do "Sobre" com 35 caracteres | Incluir o que a empresa faz e onde |
| Título de serviços com 61 caracteres | Cortar 1 ou 2 caracteres |
| Descrição da privacidade com 85 caracteres | Completar até 110 a 160 |
| Sem `BreadcrumbList` | Incluir nas páginas internas |
| Uma única página para 11 serviços | Uma página por frente (PDI, propriedade industrial, gestão) dá a cada assunto seu próprio título, descrição e chance de aparecer na busca |
| Sem conteúdo para buscas informativas | Três a cinco guias perenes: "Como registrar uma patente no INPI", "Patente de invenção ou modelo de utilidade?", "O que é TRL", "Lei do Bem para projetos de produto" |
| Imagens só em JPG/PNG, sem `srcset` | Componente `<Image>` do Astro |

## GEO: ser encontrado e citado por assistentes de IA

**No lugar:** `llms.txt`, robôs de IA liberados no `robots.txt`, dados estruturados de `Organization` (com CNPJ, cidade, ano de fundação e áreas de conhecimento), `WebSite`, `WebPage` com data de atualização, `Service` e `VideoObject`.

| Achado | Recomendação | Onde |
|---|---|---|
| `Organization` sem `sameAs` | Cadastrar os perfis oficiais | painel |
| Nenhuma pessoa identificada (`Person`, `founder`) | Página "Sobre" com o responsável técnico e dados estruturados | código + texto |
| Quase nenhuma fonte externa citada (só a busca do INPI) | Ao falar de patente, TRL, Lei do Bem, FINEP e BNDES, apontar a fonte oficial. Assistentes preferem textos que citam de onde vêm as afirmações | painel / texto |
| Caso do portfólio sem dados estruturados próprios | `CreativeWork` ou `Article` com autor, data e o número do pedido | código |
| A empresa não aparece em outros lugares conferíveis | Google Perfil da Empresa, LinkedIn da empresa. É trabalho fora do site, mas é o que mais pesa para um assistente "confiar" em quem é a KAS-Trom | fora |

## AEO: responder perguntas diretamente

| Achado | Recomendação | Onde |
|---|---|---|
| 4 perguntas, só na página inicial | Chegar a 8 ou 10 | painel |
| "Quanto custa?" não responde | Explicar o que forma o custo (escopo, etapas contratadas) e apontar a tabela de retribuições do INPI, que é pública | painel |
| Página de serviços sem perguntas | Incluir um bloco de perguntas no modelo da página; depois disso o painel passa a editá-lo | código |
| Poucos títulos em forma de pergunta | Nos serviços: "O que é uma pesquisa de anterioridade?" seguido de uma definição de 40 a 60 palavras | texto |

**Rascunho pronto.** O arquivo `conteudo/rascunho-sugerido.json` traz 13 perguntas (as 4 atuais e 9 novas), para carregar no painel em Configurações › Carregar cópia:

- Vocês assinam acordo de confidencialidade (NDA)? — marcada com `[CONFIRMAR]`: descreve a prática da empresa e precisa ser conferida por quem responde por ela. O painel não deixa publicar enquanto a marca estiver no texto.
- Posso divulgar minha invenção antes de pedir a patente? (período de graça de 12 meses, Lei 9.279/96, art. 12)
- Qual a diferença entre patente de invenção e modelo de utilidade? (20 e 15 anos)
- Preciso ter um protótipo para pedir uma patente?
- Posso contratar só uma etapa do trabalho?
- O que é TRL e por que isso importa para o meu projeto?
- A KAS-Trom ajuda com Lei do Bem, FINEP e BNDES?
- Para quem a KAS-Trom trabalha?
- O que preciso informar no primeiro contato?

As respostas novas usam só o que o próprio site já afirma e fatos públicos da lei de propriedade industrial. Ficaram de fora, porque só a empresa sabe responder:

1. Quanto tempo leva para preparar um pedido de patente?
2. A KAS-Trom deposita o pedido no INPI ou trabalha com um agente de propriedade industrial?
3. Vocês atendem empresas de fora do estado de São Paulo?
4. De quem é a titularidade da patente ao fim do projeto?
5. Quanto custa, em ordem de grandeza? (a resposta atual não informa nada)

Uma observação para calibrar a expectativa: desde 2023 o Google mostra o formato visual de perguntas e respostas nos resultados praticamente só para sites de governo e de saúde. A marcação continua útil para o Bing e para assistentes de IA, e o conteúdo em si ajuda em qualquer busca; só não espere a "sanfona" no resultado do Google.

## Conteúdo

| Página | Palavras | Avaliação |
|---|---|---|
| Início | 583 | Clara e objetiva. O H1 é o slogan; o subtítulo e o título da página carregam os termos de busca |
| Serviços | 261 | Rasa. Cada serviço tem uma frase. Falta: para quem é, o que é entregue, como é o processo, o que o cliente precisa fornecer |
| Portfólio | 961 | A melhor página. Mostra método, documentos e o número do pedido |
| Sobre | 250 | Fala da empresa em abstrato. Não há pessoas, formação, registro profissional nem histórico |
| Contato | 158 | Adequada. Falta o prazo de resposta |
| Privacidade | 236 | Direta. Faltam base legal e prazo de guarda |

**Outros projetos na página inicial.** A pasta "Videos de Mockup 2026" tem 61 animações em 3D de projetos de 2009 a 2025 (786 MB; de 3 a 23 segundos cada, 1280×720 ou 1600×900, sem som). É material forte para mostrar amplitude: máquinas agrícolas, implementos rodoviários, tanques, equipamentos industriais. Três cuidados antes de publicar:

- **Confidencialidade.** Vários arquivos trazem nomes de clientes e de projetos no nome do arquivo. O painel pede um nome genérico para cada projeto e não usa o nome do arquivo, mas a decisão sobre o que pode ser mostrado é da empresa, contrato a contrato.
- **Coerência.** Hoje o site afirma, em três lugares (página inicial do portfólio, "Sobre" e `llms.txt`), que não divulga projetos de terceiros e que o único caso publicado é um projeto próprio. Com a vitrine no ar, essas frases precisam mudar. A tela "Outros projetos" do painel lista as frases e leva ao editor de cada uma.
- **Peso.** Os originais têm cerca de 8 Mbps. O comando `npm run videos` reduziu nove amostras de 98,9 MB para 12,1 MB (88% a menos) sem perda visível, e gera as capas. Na página, cada vídeo só é baixado quando o visitante dá o play.

Pontos de redação:

- "Vamos conversar!" aparece como título de fechamento em quatro páginas. Variar conforme a página ajuda ("Tem um produto para proteger?", "Quer ver se seu projeto é patenteável?").
- A página "Sobre" diz "não listamos clientes nem números de projetos". É uma escolha legítima; sem clientes para mostrar, quem assina o trabalho passa a ser a única prova disponível, o que reforça a prioridade 8.
- O site está só em português. Se houver interesse em clientes de fora, uma versão em inglês do portfólio seria o primeiro passo.

## Resultado dos testes (QA)

| Teste | Resultado |
|---|---|
| Erros de console em 8 páginas × 4 larguras | Nenhum (só o 404 esperado na página de erro) |
| Rolagem lateral em 320, 390, 768 e 1440 px | Nenhuma |
| axe-core, WCAG 2.2 AA, 8 páginas × 2 larguras | 0 violações |
| Lighthouse celular: início, portfólio, contato | Desempenho 100, acessibilidade 100, boas práticas 100, SEO 69 (pelo `noindex`) |
| LCP no celular | 0,9 s nas três páginas |
| CLS | 0 |
| Menu do celular: abre, fecha com Esc, devolve o foco | Passou |
| Primeiro Tab leva ao link "Pular para o conteúdo", visível | Passou |
| Cabeçalho some ao rolar para baixo e volta ao subir | Passou |
| Formulário vazio: validação impede o envio e foca o primeiro campo | Passou |
| Campo-armadilha contra robôs invisível | Passou |
| Texto a 200% | Sem rolagem lateral |
| Sem JavaScript: sanfonas | Funcionam |
| Sem JavaScript: menu do celular | **Falhou** (menu invisível) |
| Vídeo: pedido de trecho | 206 com `Content-Range` correto |
| Links e arquivos internos (24 endereços, incluindo PDFs e vídeo) | Todos no ar |
| Endereço inexistente | 404 com página própria |
| `/servicos/`, `/servicos.html`, `/index.html` | Redirecionam para o endereço limpo |
| Ícones do manifesto, `og.png`, `favicon` | Todos existem |

## O que não foi verificado

- **`kastrom.eng.br` em HTTP (porta 80)**: este ambiente só faz conexões HTTPS, então não vi para onde o Registro.br redireciona quem digita o endereço sem `https://`. Em HTTPS, o certificado inválido foi confirmado.
- **Vercel**: a conta está ligada, mas sem autorização para listar projetos nesta sessão.
- **Envio real do formulário**: não enviei mensagens de teste para não gerar e-mails falsos na caixa da empresa.
- **Áudio do vídeo**: não sei se há narração; disso depende a necessidade de legendas.
- **Leitores de tela e aparelhos reais**: os testes foram automáticos, em Chromium. Vale uma passada com VoiceOver ou TalkBack e em um iPhone.
- **Posição no Google e presença em respostas de IA**: dependem de dados do Search Console e de consultas manuais, que não existem ainda.
- **O código-fonte**: a análise de código foi feita sobre o HTML, CSS e JavaScript já compilados, não sobre os arquivos `.astro`.
