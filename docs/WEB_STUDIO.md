# Framechester Studio — operação web local

Atualizado em **28/10/2026**, America/Sao_Paulo.

O Studio oferece uma interface web em TypeScript/Vite e um backend Node.js
local para organizar canais, pesquisar pautas, editar roteiros e storytelling,
configurar a produção e acompanhar as quatro redes. O motor de produção
continua sendo a CLI Rust. O estágio desta entrega é pré-alpha executável.
O [parecer de uso local](PRONTIDAO_USO_LOCAL.md) registra o piloto aprovado,
as correções de QA/UX/DX e os limites ainda existentes para monetização.

## Instalar e iniciar

Requisitos: Node.js **22.12 ou superior**, npm, toolchain Rust, FFmpeg/ffprobe
e Python 3.11–3.13 para o Kokoro local. ASR exige seu modelo e suporte local.
Execute `npm run voices:setup` para instalar o narrador e baixar os arquivos
fixados. O Studio não baixa modelos quando é iniciado.

Somente Dora, Alex e Santa (Kokoro-82M v1.0, Apache-2.0) podem narrar.
Configurações antigas do Piper migram para Dora; modelos e vozes fora do
catálogo são bloqueados por nome e por SHA-256 antes da síntese.
Veja [licenças, arquivos e instalação](VOZES_COMERCIAIS.md).

Na raiz do repositório:

```powershell
npm --prefix web ci
npm --prefix web run engine:build
npm --prefix web run build
npm run voices:setup
npm --prefix web start
```

Abra [http://127.0.0.1:4317](http://127.0.0.1:4317). Mantenha o terminal do
servidor aberto; `Ctrl+C` encerra o servidor e interrompe a produção ativa.
`engine:build` executa o build do workspace em `--release` e disponibiliza o
binário local em `target/release/`, utilizado pelo backend (o motor motion em
debug é 5–8× mais lento). O build web verifica TypeScript e
gera `web/dist/`. A instalação completa de dependências é necessária também
para `start`, que usa `tsx`.

Na raiz, os atalhos equivalentes sao `npm run setup` (instalacao/build inicial),
`npm start` (uso cotidiano), `npm run dev` (desenvolvimento) e `npm stop`
(encerramento dos processos identificados desta instalacao). `npm start` e
`npm run dev` reinstalam as dependências quando o `package-lock.json` mudou e
recompilam o motor Rust (incremental) antes de iniciar; `npm start` também
recompila a interface. Depois de atualizar o código, basta `npm start`. `npm stop` tambem
para o Compose deste projeto quando ja preparado, sem remover os volumes.

Para Docker Desktop/Engine + Compose, use `npm run docker:up`; o comando prepara
a chave externa, constroi a imagem e aguarda a saude do servico. `npm run docker:down`
para preservando os dados. O perfil Docker e independente do perfil nativo;
nao monta nem converte silenciosamente o cofre DPAPI existente. Consulte
[DOCKER.md](DOCKER.md) para operacao, modelos, seguranca e recuperacao.

O servidor escuta somente em `127.0.0.1`. Esta entrega é para uso no próprio
computador; não inclui hospedagem, proxy público, HTTPS remoto ou acesso de
vários usuários.

## Primeiro acesso

1. Crie a senha da instalação local, entre 12 e 256 caracteres. Essa senha
   protege o Studio e é independente das senhas das redes sociais.
2. Cadastre um canal com identificador local, nome, nicho, público e idioma.
   Selecione o canal antes de trabalhar com conteúdo, contas e resultados.
3. Abra **Configurações** e confira os caminhos do Python do Kokoro, do modelo, do arquivo de vozes e,
   se utilizado, do ASR. Ajuste resolução, FPS, CRF e preset para o computador.
4. Produza um trabalho de teste com roteiro e mídia próprios, depois confira
   o vídeo e os resultados de QA no painel de produção.

A senha é derivada com scrypt e salt aleatório; `auth.json` contém somente a
derivação e o salt. A sessão fica em memória no servidor, com cookie
`HttpOnly` e `SameSite=Strict`. Reiniciar exige novo login; sessões também
expiram por inatividade ou duração máxima. O backend exige CSRF nas mutações,
incluindo setup/login, e restringe Host/Origin. A interface obtém esse contexto
automaticamente ao abrir a tela de acesso.

Após cinco tentativas de login sem êxito numa janela de 15 minutos, novas
tentativas ficam limitadas até a janela permitir outra tentativa.
O Studio não oferece recuperação por e-mail ou conta central. Preserve o
diretório privado ao investigar um problema de acesso; apagar dados não é um
procedimento de recuperação implementado.

## Perfis de dados e armazenamento

Por padrão, os dados ficam em `~/.framechester/web`, fora do repositório.
`FRAMECHESTER_WEB_HOME` seleciona outro diretório privado. Pare o servidor
antes de trocar o perfil e inicie novamente, por exemplo no PowerShell:

```powershell
$env:FRAMECHESTER_WEB_HOME = Join-Path $env:USERPROFILE '.framechester\studio-pessoal'
npm --prefix web start
```

Cada diretório conserva sua configuração, senha e conteúdo. Esses perfis são
conjuntos locais de dados do operador, sem autenticação multiusuário SaaS.
Use uma instância do servidor por diretório de dados.

| Local dentro do perfil | Conteúdo |
|---|---|
| `auth.json` | Salt e derivação da senha; sessões não são persistidas |
| `state.json` | Canais, configurações, pesquisa, roteiros, storytelling, snapshots e lançamentos financeiros |
| `vault/` | Credenciais protegidas, separadas por canal/rede |
| `production/` | Índices de jobs/assets, mídias importadas e arquivos privados de cada produção |

Os JSONs são gravados por arquivo temporário e rename; as gravações de estado
são serializadas dentro do processo. Arquivos privados são criados com modo
`0600` onde suportado. No Windows, o acesso a arquivos depende das ACLs do
diretório do usuário; as credenciais de redes recebem ainda proteção DPAPI.

O cofre implementado usa **Windows DPAPI / CurrentUser**. Tokens e segredos
OAuth não entram no bundle, no `localStorage` ou no JSON de configuração
editorial. O mecanismo está ligado ao perfil Windows: copiar o ciphertext
para outra conta/máquina não garante recuperação, e pode ser necessário
reconectar. Em outros sistemas, edição e produção locais continuam disponíveis,
mas salvar credenciais depende de uma implementação de cofre suportada; não
há fallback em texto puro. Consulte [as fronteiras do cofre](REDES_SOCIAIS_WEB.md#cofre-e-fronteiras-de-segurança).

O diretório inclui trabalho privado e deve ter backup apropriado. O Studio
não habilita backup remoto pago. O verificador OAuth Python e a CLI mantêm
seus fluxos próprios; suas credenciais não são importadas automaticamente
para o cofre web.

Para mudar a porta do servidor, defina `FRAMECHESTER_WEB_PORT` com inteiro
entre 1024 e 65535 antes de `start`. Se usar OAuth, registre o callback da
porta escolhida exatamente, conforme o guia de redes.

## Pesquisa, roteiro e storytelling

**Pesquisa de nicho:** registre público, hipótese de demanda, diferenciação,
palavras-chave, notas e fontes. Os escores preenchidos no editor são avaliações
do operador, não medição automática ou comprovação de mercado. Com YouTube
conectado, o botão de descoberta consulta uma amostra de até oito vídeos e as
estatísticas públicas disponíveis. A busca é explícita, consome a quota
aplicável e não roda ao carregar a página. A saída não fornece licença de
reutilização, previsão de receita ou prova de demanda representativa.

**Roteiro:** escreva o gancho, as cenas, a narração e o briefing visual; vincule
as fontes e as alegações. Rascunhos podem ser salvos antes de completar a
produção. Para iniciar um job, são exigidas cenas completas, pelo menos duas
URLs distintas, alegações citadas nas fontes e declaração explícita de
conferência/cruzamento. Essa declaração é do operador e não substitui checagem
dos fatos ou independência das fontes.

**Storytelling:** organize gancho, contexto, conflito, virada, resolução e CTA,
com vínculo opcional a um roteiro. O arco é um documento editorial separado;
para mudar a fala do vídeo final, atualize também as cenas do roteiro.

Formulários com alterações pedem decisão antes de sair da tela, trocar canal
ou fechar a janela de edição. **Continuar editando** preserva o formulário;
**Descartar e continuar** abandona suas mudanças. A página também solicita o
aviso nativo ao sair com trabalho pendente. Isso não é autosave: salve antes de
encerrar, pois falha do processo ou fim da sessão ainda podem perder edições.

Você pode escrever manualmente ou usar **Desenvolver com IA** dentro do editor
de pauta, roteiro ou narrativa. Os campos atuais, mesmo não salvos, formam o
briefing; a pauta/roteiro vinculado só pode pertencer ao próprio canal. Confira
o pedido em **Pedido** e os campos em **Dados usados**. Use **Gerar rascunho**,
revise a aba **Proposta** e escolha **Usar nos campos**. O assistente ocupa a
mesma área do editor; **Voltar ao editor** preserva os campos originais. Aplicar
preenche o editor sem salvar. Pautas e
roteiros voltam a rascunho; o roteiro perde a declaração de conferência e suas
alegações ficam a verificar. Depois revise e salve manualmente. O assistente
não abre URLs, aprova conteúdo ou inicia produção/publicação.

As notas de demanda, competição e viabilidade ficam em **Priorização → Minha
avaliação** e servem para ordenar a lista de pautas. Não são dados medidos nem
instruções da IA. Configuração de voz/render e finanças continuam com funções
operacionais próprias. O mapa dos campos está em [BRIEFING_CRIATIVO.md](BRIEFING_CRIATIVO.md).
Configure o modelo e sua direção criativa em **Configurações → Assistente de
criação**, conforme [PROMPT_PESSOAL.md](PROMPT_PESSOAL.md).
O assistente aceita **Claude pela API Anthropic**, **OpenAI pela Responses API**
e Ollama local como alternativa. Escolha o provedor, salve as preferências
e conecte sua chave na aba **Chave do canal**, selecionando o provedor da chave.
As chaves ficam no cofre DPAPI do Windows, separadas por canal e provedor.
Novas instalações preferem Claude; configurações Ollama antigas
são preservadas até a escolha explícita do operador.

Nos editores, **Calcular custo** envia o pedido e suas instruções ao provedor selecionado
para contagem de tokens, sem gerar texto. Confira a estimativa e clique em
**Autorizar e gerar** para iniciar uma única chamada paga. Alterações no pedido,
canal, sessão, chave ou configuração invalidam a autorização, que expira em cinco
minutos e é consumida mesmo quando a geração falha. Não há repetição automática.
O valor usa preços datados e uma margem; configure também os limites de gasto
no painel oficial do provedor. A estimativa não é um teto garantido da fatura.

O retorno preenche o editor somente com **Usar nos campos** e continua pendente
de revisão. Não há navegação web ou pesquisa externa autônoma neste conector:
O modelo trabalha com o briefing, os campos e as fontes fornecidas. A contagem e a
geração enviam esse contexto ao provedor escolhido. O adapter Anthropic do motor Rust
conserva seus bloqueios próprios; esta integração do Studio é independente.
O Ollama continua exigindo nuvem desativada e modelo local instalado.

### Consumo das chaves

Na aba **Consumo** do assistente, escolha período de 7, 30 ou 90 dias e filtre
OpenAI/Anthropic. O registro local mostra gerações, contagens, tokens reportados,
custo calculado em USD, histórico por identificação opaca da chave e até 100 chamadas
recentes. Os totais consideram todos os registros do período, incluindo respostas
descartadas que tenham uso reportado. Cache e raciocínio são parcelas dos tokens,
não valores adicionais a somar. Trocar ou remover uma chave preserva seu histórico.

O registro é persistido antes de enviar uma chamada. Sem armazenamento válido,
nenhuma nova contagem/geração remota começa. Falhas sem confirmação ficam com custo
e tokens desconhecidos; não viram zero. Um registro interrompido é recuperado como
**Sem confirmação** após reinício. O histórico não contém prompt, texto gerado,
fragmentos da chave ou erros brutos do provedor. Ele fica no perfil privado em
`ai-usage/`, fora do estado editorial e do bootstrap.

O escopo é o uso **feito pelo Framechester a partir da ativação do monitoramento**.
Não é saldo da conta nem fatura oficial e não inclui chamadas de outros aplicativos.
Os links **Consumo oficial** abrem os painéis dos provedores. APIs de relatório geral
exigem credenciais administrativas adicionais e não são consultadas pelo Studio.
Assinaturas dos aplicativos e o consumo das APIs seguem seus próprios contratos e
créditos. O perfil de dados deve ser usado por apenas uma instância do Studio.
Detalhes e evidências: [CONSUMO_IA.md](CONSUMO_IA.md).

### Fontes e revisão

Uma fonte com URL basta para produzir. Sem nenhuma, o vídeo ainda é gerado e
fica em revisão, não reprovado. Reprovação editorial é reservada ao que a
máquina consegue provar: alegação contraditória, referência fora do inventário,
URL insegura, narração duplicada, padrão de prompt injection ou asset sem
direitos registrados.

**Como aprovar e gerar a versão final.** Depois de **Produzir com IA**, o
card da prévia na fila de produção tem o botão **Gerar versão final** (ele
também aparece em **Revisar vídeo**). O diálogo mostra quantas fontes o
roteiro tem, pede a declaração **Conferi e cruzei as fontes e as alegações
desta pauta** e inicia a versão final com os mesmos visuais da prévia, sem a
marca de revisão. A declaração fica gravada no roteiro; não é preciso abrir o
editor.

O motor recebe essa declaração (`cross_checked`) e registra no relatório de
QA as verificações "revisão editorial humana" e "claims" como aprovadas;
alegações marcadas como **Fonte citada** ou **A conferir** contam como
conferidas pelo operador. Só **Contradição identificada**, URLs fora das
fontes do roteiro impedem a versão final, e o diálogo diz qual é o caso. Um roteiro sem fonte gera a versão final; o
relatório e o card pedem "ao menos 1 fonte com URL" antes de publicar.
Duração fora do alvo editorial e frames parados de cenas estáticas ficam
anotados no relatório, sem pedir revisão.

A versão final de um roteiro revisado e com fonte termina como **Concluído**,
com arquivo e conteúdo aprovados. Se o motor bloquear, o card diz o motivo.
Publicar continua manual, pelo YouTube Studio. A preparação manual
(**Produzir com IA → Controles avançados → Abrir preparação manual**)
continua disponível para trocar visuais ou usar gravações próprias.

**Buscar fontes**, na aba Fontes e revisão do roteiro, procura artigos
revisados por pares (DOI) no Crossref a partir do título, do gancho e das
alegações; **Produzir com IA** faz a mesma busca quando o roteiro gerado não
tem fontes. A consulta vai só para `api.crossref.org`, sem chave nem custo.
Cada sugestão vem marcada como automática e precisa ser lida antes de
publicar: a busca encontra o artigo, não confirma que ele sustenta a fala.

## Produção e configurações por canal

1. Clique em **Produzir com IA**, informe a orientação e o formato. Uma pauta
   ou roteiro existente do canal pode servir como referência.
2. Com Claude/OpenAI, calcule o custo e use **Autorizar e produzir**. A
   autorização cobre uma geração de roteiro; não há aprovação manual entre
   as etapas locais seguintes. Com Ollama, use **Produzir neste computador**.
3. O servidor gera e salva um novo roteiro, cria e associa os visuais,
   sintetiza a voz comercial, monta o MP4 com legendas e executa o QA. A fila
   continua executando depois que o diálogo ou navegador é fechado, enquanto
   o servidor permanecer ativo. O roteiro original e as pendências editoriais
   são preservados.
4. Acompanhe o andamento e abra **Revisar vídeo**. O arquivo tem identificação
   de revisão pendente. A produção automática não publica nem declara fontes
   verificadas; não produz um pacote de publicação aprovado.

O assistente usa a orientação e as referências fornecidas no canal; essa
etapa não executa pesquisa externa na internet nem inventa fontes. Os visuais
são composições de texto, sem geração fotográfica por API. Só a geração de
roteiro usa a IA configurada; voz, visuais, montagem e QA são locais.

**Controles avançados → Abrir preparação manual** mantém o fluxo anterior.
Nele, **Gerar prévia do vídeo** funciona com fontes ainda não revisadas ou
gravações pendentes, usando as composições ilustrativas. O vídeo recebe marca
de revisão. **Gerar versão final** continua exigindo os vínculos e a revisão
editorial. Veja [visuais automáticos](VISUAIS_AUTOMATICOS.md).

O backend mantém uma fila no processo e registra os estados dos jobs. Após
reinício, trabalhos que estavam na fila ou em execução ficam bloqueados como
interrompidos; crie um novo trabalho para retomar. Isso não é um agendador ou
uma fila distribuída com recuperação automática.

A configuração global serve como padrão. Um canal pode ter sua própria
configuração completa, que prevalece sobre o padrão. Cada job captura a
configuração efetiva ao começar; alterações posteriores não reescrevem jobs
já criados. O backend gera um `config.toml` privado por trabalho e chama a CLI
Rust com roteiro e manifesto locais. Ele **não reescreve** o arquivo de
configuração usado manualmente na CLI.

Os ajustes cobrem render H.264/libx264, dimensões, FPS, CRF/preset, voz/modelo
Kokoro e ASR. `short` orienta as dimensões para vertical; `long`, para horizontal.
`dryRun=true` e `telemetry=false` permanecem obrigatórios. O backend verifica
integridade das mídias e o motor executa QA técnico/editorial; metadados de
licença preenchidos não comprovam autorização jurídica.

`needs_review` significa que existe uma entrega para revisão. `blocked` ou
`failed` conservam diagnóstico para investigação. A reprodução do MP4 não
equivale a aprovação editorial ou publicação.

Canais têm identidade, conteúdo, vínculos e artefatos separados sob um único
operador do sistema. A exclusão é bloqueada quando há conteúdo, histórico,
jobs, assets ou conexões a preservar. Num canal vazio, os vínculos/autorizações
pendentes locais são limpos antes da exclusão; falha nessa limpeza preserva o
canal. Desconectar não revoga consentimentos globais no provedor.

## Painel das quatro redes e finanças

| Rede | Leitura implementada | Receita no painel |
|---|---|---|
| YouTube | Identidade do canal, Analytics e descoberta de vídeos, com autorização própria | Receita **estimada** em BRL quando disponível e autorizada; pagamento recebido continua separado |
| TikTok | Identidade e contadores autorizados da Display API | Receita automática não integrada; lançamento manual com origem identificada |
| Instagram | Conta profissional vinculada a Página autorizada e seguidores disponíveis | Receita automática não integrada; lançamento manual com origem identificada |
| Facebook | Identidade e contadores da Página autorizada | Receita automática não integrada; lançamento manual com origem identificada |

Conectar e sincronizar são ações explícitas que podem fazer consultas de
leitura às APIs. Contas, permissões, revisão de aplicativo e escopos precisam
ser aceitos pela plataforma. O [guia de redes sociais](REDES_SOCIAIS_WEB.md)
descreve configuração, endpoints usados e limites concretos de cada integração.

Dados indisponíveis permanecem `null`/desconhecidos. Contadores atuais de
perfil não são histórico de 28 dias. Receita estimada pode conter ajustes
negativos e não é pagamento recebido. Pagamentos, estimativas e custos
informados manualmente mantêm categoria, moeda, data e origem próprias; não
some moedas ou classes diferentes como se fossem lucro conciliado.

**Publicação está desativada nas quatro redes.** Não há upload automático,
compra de audiência ou ativação de monetização. O uso do Studio e um teste
aprovado não garantem aprovação no YPP, audiência, receita ou lucro.

## Desenvolvimento, verificação e diagnóstico

```powershell
npm --prefix web run check
npm --prefix web test
npm --prefix web run build
```

Para desenvolvimento com Vite e backend em watch:

```powershell
npm --prefix web run dev
```

Abra [http://127.0.0.1:5173](http://127.0.0.1:5173). O comando habilita
`FRAMECHESTER_WEB_DEV=1` no processo do backend. O proxy Vite usa a porta do
backend em `FRAMECHESTER_WEB_PORT`, com padrão 4317; somente
esse modo inclui a origem Vite na allowlist. O fluxo de uso normal continua
sendo `build` seguido de `start` na porta 4317.

| Sintoma | Próxima verificação |
|---|---|
| Motor indisponível | Execute `npm --prefix web run engine:build`; no Windows, encerre jobs/processos anteriores antes de substituir o executável |
| Kokoro/modelos ausentes ou hash divergente | Execute `npm run voices:setup` e confira os caminhos em Configurações; modelos fora do catálogo ficam bloqueados |
| Sessão expirada ou CSRF inválido | Reabra a tela de acesso e faça login; reinício do backend invalida a sessão anterior |
| Host/Origin recusado | Use a URL local da instância; no modo Vite, inicie por `run dev` |
| Consulta social recusada | Confira identidade esperada, conexão, validade e escopos conforme o guia de redes |
| QA bloqueado | Leia o relatório e revise o artefato; não trate um check pendente como aprovação |

### Estrutura do código do Studio

`npm --prefix web run format` aplica o Prettier; `run check` falha se algum
arquivo estiver fora do padrão. O frontend em `web/src` separa estado, casca
e páginas:

| Pasta ou arquivo | Responsabilidade |
|---|---|
| `main.ts` | importa o CSS e inicia a casca; nada mais |
| `studio/state.ts` | o objeto `studio` (dados carregados, canal, documento ativo), navegação (`pages`, `go`, `render`), `refresh`/`save`/`action` e o poll de jobs |
| `studio/shell.ts` | login, barra lateral, seletor de canal e montagem da página atual em `#main-content` |
| `studio/toast.ts`, `studio/platforms.ts`, `format.ts` | avisos, rótulos das redes e formatação de número/data |
| `pages/*.ts` | uma página por arquivo, registrada em `pages/index.ts`; cada uma lê e escreve só pelo `studio` |
| `editors/*.ts` | editores reutilizados pelas páginas: fontes, alegações, cenas, seletor de documento e botão da IA |
| `components.ts`, `dom.ts`, `ui-tabs.ts` | controles Basecoat e utilitários de DOM, sem estado da aplicação |
| `*-ui.ts` | diálogos de produção, assistente e consumo de IA, abertos pelas páginas |

O backend em `web/server` segue a mesma divisão:

| Arquivo | Responsabilidade |
|---|---|
| `app.ts` | cabeçalhos de segurança, origem local, rotas públicas (health, login, retorno OAuth, arquivos estáticos), autenticação e o despacho das rotas de API |
| `http.ts` | leitura de JSON com limite, envio de arquivos com `Range`, estáticos e validação de campos; não conhece as rotas |
| `routes/router.ts` | tabela de rotas: padrão com `:nome` e `:nome(a\|b)`, primeiro match vence, `requireChannel` para rotas de canal |
| `routes/{studio,creative,production,social,resources}.ts` | as rotas autenticadas por domínio; cada uma recebe `request`, `response`, `params`, `session` e os serviços |

Uma rota nova é um objeto `{ method, pattern, handle }` no arquivo do seu
domínio; `compileRoutes` recusa duplicatas de método e padrão na inicialização.

As páginas não importam umas às outras em ciclo: `overview` abre pauta, canal
e produção; `research` inicia roteiro; o restante só depende de `studio`.
`tests/studio-shell.test.ts` inicia a casca com uma API simulada e desenha
todas as páginas; é o teste que falha primeiro se uma página perder um import
ou ler dados antes do carregamento.

Os resultados do Studio, testes web, build e auditoria de dependências ficam
registrados na [validação web](WEB_STUDIO_VALIDACAO.md). A [validação do motor](VALIDACAO_ENTREGA.md)
registra Rust/Python e seus pilotos, com as respectivas contagens e limitações. O smoke
audiovisual ignorado na suíte padrão foi executado explicitamente. Um job
ponta a ponta no perfil local de QA produziu vídeo e terminou em
`needs_review`. Essa evidência é do cenário executado, com dados isolados, e
não constitui auditoria universal de contas, direitos ou conteúdo. Consulte
também [a auditoria de engenharia](AUDITORIA_ENGENHARIA.md).
