# Calendário: canal de estatística e história do esporte (semana 1)

Decisão do operador em 13/11/2026: canal pt-BR de dados e história do esporte, começando
pelo formato **confronto em números** (vertical, 33–56 s) renderizado com HyperFrames.
Um vídeo por dia às **19:00 (Brasília)**, de sáb 14/11 a sex 20/11/2026, em Reels,
Shorts e TikTok. Todo número da legenda saiu do mesmo JSON que gerou o vídeo
(base `international_results`, CC0, lida em 13/11/2026; placar com prorrogação, sem
pênaltis; "Alemanha" inclui a Alemanha Ocidental).

Decisão do operador em 13/11/2026: este canal é pt-BR e voltado ao Brasil. Para ele, isso
substitui a regra de 08/11 ("só inglês, nada voltado ao Brasil"), que continua valendo para
`compound-coyote` e `kernel-clarity`. O horário dos dois calendários não conflita: são
canais e contas diferentes.

## Uma vez por máquina

```bash
npm --prefix hyperframes ci
cargo build --release -p framechester-cli
mkdir -p .framechester/dados
curl -sSLo .framechester/dados/results.csv https://raw.githubusercontent.com/martj42/international_results/master/results.csv
```

No `framechester.toml`, cadastre o canal (o `--canal` é obrigatório quando há canais e
vai para o manifesto de cada vídeo):

```toml
[[channels]]
id = "esporte-em-dados"
language = "pt-BR"
```

Os JSONs da semana já estão em `examples/esporte/`. Para regerar um a partir de um CSV
mais novo (os números podem mudar se houve jogo depois de 13/11):

```bash
./target/release/framechester internacionais --csv .framechester/dados/results.csv --a Brazil --b Argentina --lido-em AAAA-MM-DD --saida examples/esporte/brasil-argentina.confronto.json
```

Cada dia abaixo: um comando gera (o `--gancho` é o ângulo do dia, escrito sob o título dentro do vídeo) `artifacts/semana/<id>/final.mp4` e só sai com código 0
se o QA técnico aprovar. Código 2 = reprovado: não poste.

## Semana

| Dia (19:00 BRT) | Confronto | Jogos | Duração |
|---|---|---|---|
| sáb 14/11 | Brasil × Argentina | 110 (1914–2025) | 55,8 s |
| dom 15/11 | Argentina × Uruguai | 183 (1902–2025) | 55,7 s |
| seg 16/11 | Brasil × Uruguai | 79 (1916–2024) | 55,8 s |
| ter 17/11 | Inglaterra × Escócia | 118 (1872–2023) | 55,8 s |
| qua 18/11 | Brasil × Alemanha | 23 (1963–2018) | 32,8 s |
| qui 19/11 | Alemanha × Holanda | 49 (1910–2026) | 55,8 s |
| sex 20/11 | Brasil × Chile | 76 (1916–2025) | 55,8 s |

### sáb 14/11 · Brasil × Argentina

```bash
./target/release/framechester confronto --canal esporte-em-dados --dados examples/esporte/brasil-argentina.confronto.json --saida artifacts/semana/brasil-argentina --gancho "A liderança trocou de lado uma vez só"
```

Título (Shorts): `Brasil x Argentina: todos os 110 jogos, um por um`

```text
110 jogos desde 1914: Brasil 43 vitórias, Argentina 41, 26 empates.
A Argentina abriu na frente e a liderança trocou de lado uma vez só.
Maiores goleadas: 6–2 do Brasil em 1945 e 6–1 da Argentina em 1940, as duas pela Copa Roca.

Contagem da base international_results (CC0), com prorrogação e sem pênaltis. CBF e AFA contam alguns jogos de forma diferente.
Qual clássico você quer ver em números?

#futebol #brasilxargentina #selecaobrasileira #estatistica #historiadofutebol
```

### dom 15/11 · Argentina × Uruguai

```bash
./target/release/framechester confronto --canal esporte-em-dados --dados examples/esporte/argentina-uruguai.confronto.json --saida artifacts/semana/argentina-uruguai --gancho "O Uruguai nunca passou à frente"
```

Título: `Argentina x Uruguai: o duelo de seleções mais jogado da história`

```text
183 jogos desde 1902, o confronto entre seleções com mais partidas na base.
Argentina 85 vitórias, Uruguai 54, 44 empates. A Argentina saiu na frente com um 6–0 em Montevidéu e o Uruguai nunca passou à frente na contagem.
Maior vitória uruguaia: 5–0 em 1959, pela Copa América.

Base international_results (CC0), com prorrogação e sem pênaltis.

#futebol #argentina #uruguai #copaamerica #estatistica #historiadofutebol
```

### seg 16/11 · Brasil × Uruguai

```bash
./target/release/framechester confronto --canal esporte-em-dados --dados examples/esporte/brasil-uruguai.confronto.json --saida artifacts/semana/brasil-uruguai --gancho "O Maracanazo é 1 de 79 jogos"
```

Título: `Brasil x Uruguai: o Maracanazo é 1 de 79 jogos`

```text
79 jogos desde 1916: Brasil 37 vitórias, Uruguai 21, 21 empates.
O Uruguai começou na frente e o Brasil virou a contagem uma vez, para nunca mais devolver.
A maior vitória uruguaia é um 6–0 em 1920. A maior sequência brasileira: 7 vitórias seguidas, de 1968 a 1980.

Base international_results (CC0), com prorrogação e sem pênaltis.

#futebol #brasilxuruguai #maracanazo #selecaobrasileira #estatistica
```

### ter 17/11 · Inglaterra × Escócia

```bash
./target/release/framechester confronto --canal esporte-em-dados --dados examples/esporte/inglaterra-escocia.confronto.json --saida artifacts/semana/inglaterra-escocia --gancho "O 1º jogo de seleções da história foi 0 a 0"
```

Título: `O primeiro jogo de seleções da história foi 0 a 0: Inglaterra x Escócia`

```text
30 de novembro de 1872, Glasgow: Escócia 0 x 0 Inglaterra. Foi ali que o futebol entre seleções começou.
Desde então: 118 jogos, Inglaterra 49 vitórias, Escócia 42, 27 empates. A liderança trocou de lado duas vezes.
Maiores goleadas: 9–3 da Inglaterra em 1961 e 7–2 da Escócia em 1878.

Base international_results (CC0), com prorrogação e sem pênaltis.

#futebol #inglaterra #escocia #historiadofutebol #estatistica
```

### qua 18/11 · Brasil × Alemanha

```bash
./target/release/framechester confronto --canal esporte-em-dados --dados examples/esporte/brasil-alemanha.confronto.json --saida artifacts/semana/brasil-alemanha --gancho "O 7 a 1 é só 1 de 23 jogos"
```

Título: `Brasil x Alemanha: o 7 a 1 é só 1 de 23 jogos`

```text
23 jogos desde 1963: Brasil 13 vitórias, Alemanha 5, 5 empates. O Brasil nunca esteve atrás na contagem.
O 7–1 de 2014 é a maior vitória alemã. A maior brasileira: 4–0 na Copa das Confederações de 1999.

Base international_results (CC0), com prorrogação e sem pênaltis. "Alemanha" inclui a Alemanha Ocidental.

#futebol #brasilxalemanha #7a1 #selecaobrasileira #estatistica
```

### qui 19/11 · Alemanha × Holanda

```bash
./target/release/framechester confronto --canal esporte-em-dados --dados examples/esporte/alemanha-holanda.confronto.json --saida artifacts/semana/alemanha-holanda --gancho "O empate ganha esse clássico"
```

Título: `Alemanha x Holanda: o empate ganha esse clássico`

```text
49 jogos desde 1910: 19 empates, mais do que as 18 vitórias alemãs e as 12 holandesas.
A Holanda abriu com 2 vitórias seguidas em 1910; a Alemanha virou a contagem uma vez e segurou.
Maior goleada: 7–0 da Alemanha em 1959. Da Holanda: 3–0 em 2018, pela Liga das Nações.

Base international_results (CC0), com prorrogação e sem pênaltis. "Alemanha" inclui a Alemanha Ocidental.

#futebol #alemanha #holanda #eurocopa #estatistica
```

### sex 20/11 · Brasil × Chile

```bash
./target/release/framechester confronto --canal esporte-em-dados --dados examples/esporte/brasil-chile.confronto.json --saida artifacts/semana/brasil-chile --gancho "O Chile nunca ganhou duas seguidas"
```

Título: `O Chile nunca ganhou duas seguidas do Brasil`

```text
76 jogos desde 1916: Brasil 55 vitórias, Chile 8, 13 empates.
O Chile nunca venceu dois jogos seguidos contra o Brasil. O Brasil já venceu 9 seguidos, de 1937 a 1954.
Maiores goleadas: 7–0 do Brasil em 1959 e 4–0 do Chile em 1987, pela Copa América.

Base international_results (CC0), com prorrogação e sem pênaltis.

#futebol #brasilxchile #selecaobrasileira #eliminatorias #estatistica
```

## Antes de postar

- Instagram: Reels, capa no quadro do título (0:01), legenda acima. Publica público
  (o Instagram não tem modo privado).
- YouTube: Shorts, título da tabela, legenda na descrição.
- TikTok: legenda acima; o título vira a primeira linha.
- Se o CSV for regerado, confira os números da legenda no `render_manifest.json`
  (`summary`) antes de postar: a legenda acima vale para a base lida em 13/11/2026.
