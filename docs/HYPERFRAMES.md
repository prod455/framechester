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
| Travas | `hyperframes` e `gsap` em versão exata; `undici` forçado para versão sem os avisos do `npm audit`; telemetria e checagem de atualização do HyperFrames desligadas por variável de ambiente em todo comando; estado dele em `.framechester/hyperframes/` (ignorado), não no home. `publish` do HyperFrames nunca é chamado. |

## Comandos

O motor em Rust é o ponto de entrada: `framechester confronto` e
`framechester internacionais` são bindings que chamam o pacote `hyperframes/` (Node) e,
no confronto, rodam o QA técnico do próprio motor sobre o MP4 e gravam o veredito no
manifesto. O CLI Node não roda QA; use sempre o `framechester`.

```bash
npm --prefix hyperframes ci
cargo build --release -p framechester-cli

# 1. Dados: baixe o CSV (CC0) e gere o confronto de dois times
mkdir -p .framechester/dados && curl -sSLo .framechester/dados/results.csv \
  https://raw.githubusercontent.com/martj42/international_results/master/results.csv
./target/release/framechester internacionais --csv .framechester/dados/results.csv \
  --a Brazil --b Argentina --lido-em 2026-11-13 --saida examples/esporte/brasil-argentina.confronto.json

# 2. Vídeo: projeto HyperFrames, render, QA técnico e manifesto
./target/release/framechester confronto --dados examples/esporte/brasil-argentina.confronto.json \
  --saida artifacts/bra-arg
# --qualidade draft para iterar; --corrida 46 é a duração da corrida em segundos; --sem-render só monta o projeto

npm --prefix hyperframes test                     # testes do pacote, inclui hyperframes lint do projeto gerado
npm --prefix hyperframes run check                # tsc + prettier
```

O pacote é achado em `hyperframes/` a partir do diretório atual, ou em
`FRAMECHESTER_HYPERFRAMES_DIR`. Precisa de `node` 22+ no PATH.

Saída em `--saida`: `projeto/` (abre no `npx hyperframes preview` para ajustar à mão),
`final.mp4` e `render_manifest.json` (versões, SHA-256 dos dados, do HTML e do vídeo,
tempos, resumo e o relatório do QA). Código de saída: 0 QA aprovado, 1 QA pendente, 2 QA
reprovado. Sem QA aprovado, nada vai para publicação.

Em máquina sem navegador próprio do HyperFrames, aponte um com
`HYPERFRAMES_BROWSER_PATH` (de preferência um `chrome-headless-shell`, que habilita a
captura BeginFrame, mais rápida e exata).

## Template `confronto` (vertical 1080×1920, 30 fps)

- Abertura (2,6 s): esporte, os dois lados, número de jogos e período.
- Corrida: um jogo a cada `perMatch` segundos (0,22–1 s; 110 jogos ≈ 0,42 s). Placar de
  vitórias/empates com pulso no contador que mudou, gols acumulados, quem lidera, barra
  de proporção, gráfico do saldo de vitórias (lado A acima de zero, B abaixo), fita de
  cartões com data e placar (sempre lado A primeiro) e a linha do jogo atual
  (`BRA 2–3 ARG · Copa América · Santiago, Chile`). O ano atual aparece grande no fundo.
- Fechamento (6 s): quem venceu mais e por quanto, maior vitória de cada lado, maior
  sequência de vitórias de cada lado e quantas vezes a liderança trocou de lado; uma
  linha por 1,2 s, para dar tempo de ler e para o QA de congelamento passar.
- Som sintetizado no próprio pacote: um bip por jogo (agudo vitória A, médio empate,
  grave vitória B) e uma batida no veredito. Nenhum áudio de terceiros.
- Rodapé fixo com fonte, licença, data de leitura e o que a contagem inclui.
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
