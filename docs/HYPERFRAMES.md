# Renderizador HyperFrames

Decisão do operador em 13/11/2026: parar de competir com o HyperFrames e renderizar com
ele. O pacote `hyperframes/` compila dados em composições HTML/GSAP, renderiza com o CLI
do HyperFrames (Chrome headless + FFmpeg) e passa o MP4 pelo QA técnico do motor
(`framechester qa`). Primeiro uso: o canal de estatística e história do esporte.

## ADR-0003: HyperFrames como renderizador dos formatos de dados

**Status:** aceita. Complementa a ADR-0002 (`docs/MOTOR_MOTION.md`).

| | |
|---|---|
| Decisão | Formatos novos (começando pelo confronto em números) são templates HTML/GSAP renderizados pelo HyperFrames. O motor motion em Rust continua produzindo os explicadores narrados já existentes até cada formato ser portado. |
| Por quê | O HyperFrames já tem o que o motor próprio vinha reimplementando (tipografia web, SVG, GSAP, captura determinística por quadro, mixagem). Competir custava fatias inteiras por recurso. |
| Contrato | Dado de entrada validado (`hyperframes/src/confronto.ts`) → projeto autocontido (sem rede no render) → MP4 → `framechester qa`. Todo número na tela é derivado das linhas da fonte, com hash e data de leitura no manifesto. |
| Riscos aceitos | Node e Chromium no caminho crítico; versão do navegador muda o pixel (Docker do HyperFrames resolve se precisar); o GSAP tem licença própria "no charge", não OSI (ver `THIRD_PARTY_NOTICES.md`). |
| Travas | `hyperframes` e `gsap` em versão exata; `undici` forçado para versão sem os avisos do `npm audit`; telemetria e checagem de atualização do HyperFrames desligadas por variável de ambiente em todo comando; o processo dele roda com `HOME`/`USERPROFILE` e cache em `.framechester/hyperframes/` (ignorado), então config, cache e navegador baixado ficam fora do home do operador (o 0.9 grava em `~/.hyperframes` e `~/.cache/hyperframes` a partir do home). `publish` do HyperFrames nunca é chamado. |

## Comandos

O motor em Rust é o ponto de entrada: `framechester confronto` e
`framechester internacionais` são bindings que chamam o pacote `hyperframes/` (Node) e,
no confronto, rodam o QA técnico do próprio motor sobre o MP4 e gravam o veredito no
manifesto. O CLI Node não roda QA; use sempre o `framechester`. Rode tudo **na raiz do
repositório** (o pacote é achado em `hyperframes/` a partir do diretório atual, ou em
`FRAMECHESTER_HYPERFRAMES_DIR`). Precisa de `node` 22+ e `ffmpeg` no PATH, ou do caminho
do ffmpeg em `[render] ffmpeg_path`, que o motor repassa ao HyperFrames.

Linux/macOS (bash):

```bash
npm --prefix hyperframes ci
cargo build --release -p framechester-cli
mkdir -p .framechester/dados
curl -sSLo .framechester/dados/results.csv https://raw.githubusercontent.com/martj42/international_results/master/results.csv
./target/release/framechester internacionais --csv .framechester/dados/results.csv --a Brazil --b Argentina --lido-em 2026-11-13 --saida examples/esporte/brasil-argentina.confronto.json
./target/release/framechester confronto --canal esporte-em-dados --dados examples/esporte/brasil-argentina.confronto.json --saida artifacts/bra-arg --gancho "A liderança trocou de lado uma vez só"
```

Windows (PowerShell):

```powershell
npm --prefix hyperframes ci
cargo build --release -p framechester-cli
New-Item -ItemType Directory -Force .framechester\dados | Out-Null
curl.exe -sSLo .framechester\dados\results.csv https://raw.githubusercontent.com/martj42/international_results/master/results.csv
.\target\release\framechester.exe internacionais --csv .framechester\dados\results.csv --a Brazil --b Argentina --lido-em 2026-11-13 --saida examples\esporte\brasil-argentina.confronto.json
.\target\release\framechester.exe confronto --canal esporte-em-dados --dados examples\esporte\brasil-argentina.confronto.json --saida artifacts\bra-arg --gancho "A liderança trocou de lado uma vez só"
```

Opções do `confronto`: `--canal` (obrigatório quando o `framechester.toml` tem canais;
vai para o manifesto; o template escreve em pt-BR e recusa canal de outro idioma),
`--gancho` (ângulo editorial do vídeo, até 44 caracteres, sob o título), `--qualidade
draft|standard|high`, `--corrida <segundos>` (padrão 46), `--sem-render` (só monta o
projeto) e `--so-qa` (não renderiza: refaz o QA do `final.mp4` existente e regrava o
manifesto).

Saída em `--saida`: `projeto/` (abre no `npx --prefix hyperframes hyperframes preview`
para ajustar à mão), `final.mp4` e `render_manifest.json`: canal, versões (HyperFrames,
GSAP, Node, navegador), hash do template e do código que desenhou o vídeo, SHA-256 dos
dados, do HTML e do vídeo, caminhos relativos à pasta de saída, tempos, resumo e o
relatório do QA. Um vídeo e um manifesto anteriores na mesma pasta são apagados antes de
começar, e o MP4 só ganha o nome `final.mp4` quando o render termina: nunca fica um "pass"
antigo ao lado de um vídeo novo.

Códigos de saída: **0** QA aprovado (pode postar), **1** revisão humana (inclui QA pulado:
pulado não é aprovado), **2** QA reprovado (não poste), **3** erro de execução (sem node,
sem `npm ci`, render ou lint quebrado; nada foi avaliado). Depois de um 2 a CLI diz onde
a tela ficou parada (por exemplo `tela parada em 47.9–50.0s`); corrija e rode o mesmo
comando, ou só `--so-qa` se o MP4 não mudou.

Testes: `npm --prefix hyperframes test` (inclui o `hyperframes lint` do projeto gerado,
sem navegador, e o runtime do navegador rodado em `node:vm`: um quadro não depende dos
anteriores e nenhum trecho fica 1,8 s sem mudança de área grande) e
`npm --prefix hyperframes run check` (tsc e prettier, inclusive do template).

Em máquina sem navegador próprio do HyperFrames, o primeiro render baixa um (para
`.framechester/hyperframes/`). Para usar um já instalado, aponte
`HYPERFRAMES_BROWSER_PATH` (de preferência um `chrome-headless-shell`, que habilita a
captura BeginFrame, mais rápida e exata).

## Template `confronto` (vertical 1080×1920, 30 fps)

- Abertura (2,6 s): esporte, número de jogos e período; os dois lados; o gancho do dia
  (`--gancho`) ou "Todos os N jogos, um por um".
- Corrida: um jogo a cada `perMatch` segundos (0,22–1 s; 110 jogos ≈ 0,42 s). Placar de
  vitórias/empates com pulso no contador que mudou, gols acumulados, quem lidera, barra
  de proporção, gráfico do saldo de vitórias (lado A acima de zero, B abaixo), fita de
  cartões com data e placar (sempre lado A primeiro) e, quando o ritmo deixa ler (0,6 s
  ou mais por jogo), a linha do jogo atual (`BRA 2–3 ARG · Copa América · Santiago, Chile`).
  O ano atual aparece grande no fundo. Percentuais por maior resto: somam sempre 100.
- Pausa antes do veredito proporcional ao ritmo (`1,4 s − perMatch`, mínimo 0,3 s).
- Fechamento (6 s): quem venceu mais e por quanto ("Brasil: 8 vitórias a mais"), maior
  vitória de cada lado, maior sequência de vitórias de cada lado e quantas vezes a
  liderança trocou de lado; uma linha por 1,2 s, enquanto a tela inteira sobe 8 px: linha
  de texto entrando é mudança pequena demais para o `freezedetect`, e dois renders sem
  esse movimento reprovaram no QA.
- Cores de time usadas como texto são clareadas até 4,5:1 sobre o painel (WCAG AA); a cor
  do uniforme fica nas barras e nos selos, com tinta que também passa de 4,5:1 (testado
  para toda a tabela de seleções). Texto informativo de 20 px ou mais.
- Som sintetizado no próprio pacote: um bip por jogo (agudo vitória A, médio empate,
  grave vitória B) e uma batida no veredito. Nenhum áudio de terceiros.
- Rodapé fixo (22 px) com fonte, licença, data de leitura e o que a contagem inclui.
- Zona segura dos apps verticais: tudo legível entre y 168 e 1330; abaixo de y 1056 nada
  legível passa de x 892 (botões à direita).

Runtime (`hyperframes/templates/confronto.js`): tudo da corrida é função de um único
número `p` (jogos decorridos) movido por um tween linear, então qualquer quadro renderiza
sozinho, em qualquer ordem, como o HyperFrames exige. Dados entram por uma ilha JSON e
`textContent`; nenhum campo da fonte vira markup (teste com `</script>` no nome da
competição).

## Fonte de dados

`international_results` (Mart Jürisoo), CC0 1.0: jogos de seleções principais
masculinas desde 1872, placar com prorrogação e sem pênaltis, nomes atuais das seleções.
Federações divergem em alguns jogos (Brasil × Argentina é o caso clássico), por isso o
rodapé diz de onde é a contagem e o manifesto guarda o hash do CSV lido. Times novos:
acrescente nome em português, sigla e cor em `TEAMS` (`hyperframes/src/internacionais.ts`);
time desconhecido falha em vez de inventar cor ou nome.

Outros esportes: o JSON de confronto (tipo `Confronto` em `hyperframes/src/confronto.ts`) aceita qualquer
esporte de dois lados com placar; falta só um leitor para cada fonte (próxima fatia).

Calendário da primeira semana do canal, com legendas e comandos:
[`docs/CALENDARIO_ESPORTE_EM_DADOS.md`](CALENDARIO_ESPORTE_EM_DADOS.md).

## Próximas fatias

1. Studio: botão "Confronto em números" na fila de produção do canal de esportes.
2. Leitores de outras fontes abertas (basquete, clubes brasileiros) com licença conferida.
3. Formato horizontal (1920×1080) do mesmo template para vídeo longo.
4. Narração Kokoro opcional por cima da corrida, nas viradas de liderança.
