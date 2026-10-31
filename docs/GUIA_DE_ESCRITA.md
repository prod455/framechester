# Guia de escrita

Como escrever a documentação e os textos da interface do Framechester. Vale para
`README.md`, `docs/`, `CHANGELOG.md` e tudo o que aparece no Studio: botões,
títulos, dicas, avisos e mensagens de erro.

## Idioma

- Documentação e interface ficam em **português do Brasil**, com acentos.
- Ficam em inglês, exatamente como estão: identificadores de código, comandos,
  flags, caminhos, nomes de arquivos, variáveis de ambiente e nomes de campos JSON
  (`produce`, `--workdir`, `qa_report.json`, `FRAMECHESTER_WEB_HOME`).
- Os arquivos de instrução para agentes (`CLAUDE.md`, `AGENTS.md` e `.agents/`)
  continuam em inglês.
- Nomes de produtos e marcas não se traduzem: YouTube, Docker, FFmpeg, Kokoro,
  Basecoat.

## Voz

- **Direta.** Diga o que a pessoa precisa saber primeiro; o contexto vem depois.
- **Segunda pessoa.** Fale com "você": "Você autoriza o custo antes da geração paga."
- **Frases curtas.** Uma ideia por frase. Se precisar de "e", "mas" e "porque" na
  mesma frase, divida.
- **Imperativo para ações.** "Rode", "Abra", "Escolha", "Confira", "Instale".
  Evite "é necessário que o usuário execute".
- **Sem promessas.** Não diga que algo garante views, receita ou elegibilidade.
  Descreva o que o sistema faz e o que continua com você.

| Evite | Prefira |
|---|---|
| É necessário executar o comando de setup antes da utilização. | Rode `npm run setup` antes da primeira vez. |
| O usuário deverá selecionar o canal desejado. | Escolha o canal. |
| A funcionalidade de envio encontra-se desativada. | O envio está desativado. |

## Botões e ações

- **Comece com um verbo** e diga o resultado: **Gerar versão final**, **Gerar Short**,
  **Enviar ao YouTube**, **Salvar roteiro**, **Buscar fontes**.
- **Um nome por ação.** A mesma ação tem o mesmo nome em todas as páginas e diálogos
  (**Novo vídeo**, **Assistir**, **Gerar versão final**, **Tentar de novo**). Veja as
  regras em [`DESIGN.md`](../DESIGN.md#leis-de-ux-na-prática).
- **Sem rótulos genéricos.** "OK", "Enviar" ou "Continuar" sozinhos não dizem o que
  vai acontecer. "Salvar canal" diz.
- **Estado em andamento** usa gerúndio e reticências: "Iniciando a versão final…",
  "Enviando como privado…".

## Mensagens de erro

Toda mensagem de erro diz **o que aconteceu** e **o que fazer agora**.

- Não culpe a pessoa ("Você digitou errado"). Descreva o fato.
- Não use jargão nem códigos soltos ("Erro 500", "ENOENT"). Se o detalhe técnico
  ajudar, coloque depois da explicação.
- Ofereça a saída: um botão (**Tentar de novo**, **Ver diagnóstico**) ou o próximo passo.

| Evite | Prefira |
|---|---|
| Erro ao consultar o cofre. | Não foi possível consultar o cofre. Você pode tentar salvar a chave novamente. |
| Falha de rede. | Não foi possível acessar o servidor local. Confira se o Studio está em execução. |
| Entrada inválida. | A senha precisa ter pelo menos 12 caracteres. |

O limite de 12 caracteres é o mesmo que o Studio pede na senha local. Antes de
colocar um número em uma mensagem, confira o valor real no código.

## Números e unidades

- Use algarismos e um espaço antes da unidade: **58 s**, **12 caracteres**,
  **1080×1920**, **−14 LUFS**, **256 GB**.
- Decimais com vírgula no texto corrido: **0,5 s**, **0,6 s**. Em comandos, código e
  valores de configuração, mantenha o formato original (`-1.5`, `--max-secs 58`).
- Datas na documentação: `AAAA-MM-DD` (2026-10-31), como no changelog.
- Não arredonde para parecer melhor e não invente números: todo número vem de uma
  medição, do código ou de uma fonte citada.

## Glossário

Use sempre estes termos, com esta grafia. Os nomes em negrito são os rótulos que
aparecem na interface.

| Termo | Significado | Observação |
|---|---|---|
| **Criar vídeo** | Tela inicial do Studio: o vídeo atual do canal em quatro passos (**Pauta**, **Gerar vídeo**, **Revisar**, **Enviar ao YouTube**) | É também o nome no menu |
| **Vídeos** | Lista das produções do canal | Não chame de "fila" ou "jobs" na interface |
| **Novo vídeo** | Ação que abre o diálogo para começar um vídeo | Única ação principal da página **Vídeos** |
| prévia | Versão rápida para revisar, com a marca PRÉVIA · REVISÃO PENDENTE; nunca sai do computador | Não use "preview" no texto para o usuário |
| versão final | O vídeo gerado depois da revisão editorial, pronto para enviar | Botão: **Gerar versão final** |
| Short | Corte vertical de até 58 s de um vídeo aprovado | Com S maiúsculo; botão: **Gerar Short** |
| canal | Um canal do YouTube cadastrado no Studio, com dados e credenciais separados | Página **Canais** |
| roteiro | O texto narrado do vídeo, com cenas e fontes | |
| pauta | O tema e a orientação de que o roteiro parte | Primeiro passo de **Criar vídeo** |
| motor | O programa em Rust que gera os vídeos | **motor motion**: a parte do motor que anima as cenas a partir do storyboard |
| Studio | A interface web local do Framechester | Com S maiúsculo |
| cofre | Onde ficam as credenciais, só no seu computador | "cofre local" |
| QA técnico | Verificação automática do arquivo de vídeo: duração, resolução, áudio, quadros pretos, legendas | |
| revisão editorial | A sua conferência das fontes e alegações, registrada pela declaração **Conferi e cruzei as fontes e as alegações** | Separada do QA técnico; não chame as duas de "QA" |
| **Avançado** | Grupo recolhido do menu com pesquisa, roteiros, histórias, resultados, contas, configurações e visão geral | |

## Termos a evitar

| Evite | Use | Onde |
|---|---|---|
| job | produção | Texto para o usuário (no código, `job` continua) |
| render, renderizar | gerar o vídeo | Texto para o usuário; em documentação técnica do motor, "renderizador" é aceitável |
| deploy | subir (ex.: "Como subir o Framechester") | Texto para o usuário |
| preview | prévia | Sempre |
| upload | envio, enviar | Texto para o usuário; nomes de APIs (`youtube.upload`) continuam |
| usuário | você | Quando o texto fala com a pessoa |
| clique aqui | um link com o nome do destino | Sempre |

## Antes de publicar um texto

- Os acentos estão certos? ("versão", "produção", "não").
- Cada ação começa com verbo e diz o resultado?
- Cada erro diz o que aconteceu e o que fazer?
- Os termos batem com o glossário e com os rótulos reais da interface (`web/src`)?
- Comandos, caminhos e identificadores ficaram intactos?
- Os links relativos apontam para arquivos que existem?
