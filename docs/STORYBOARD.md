# Storyboard semântico

O storyboard é o plano renderizador-independente de um vídeo explicativo. Ele descreve
**significado** — qual conceito cada cena explica, quais objetos existem, como se
relacionam e o que acontece em qual palavra da narração — e nunca coordenadas, SVG ou
filtros do FFmpeg. O motor de animação (`crates/framechester-motion`) decide a
aparência por formato.

- Tipos e validador oficial: `crates/framechester-core/src/storyboard.rs`
  (`Storyboard::validate`).
- Espelho em JSON Schema para editores e modelos: `docs/schemas/storyboard.schema.json`
  (um teste mantém as enumerações iguais às do Rust).
- Planejador determinístico de roteiro → storyboard: `crates/framechester-core/src/planner.rs`.
- Narração e timing real: `crates/framechester-core/src/narration.rs` e
  `crates/framechester-motion/src/narrate.rs`.

## Estrutura

```text
Storyboard
├─ version, title, channel, format (vertical | horizontal | x), language
└─ scenes[]
   ├─ id, concept (uma frase; vira o título da cena), learning_goal
   ├─ narration, segments[] (preenchidos pela narração: frases com tempo real e palavras)
   ├─ duration_secs, start_secs (do áudio, não da estimativa)
   ├─ composition { kind, … }           ← o que aparece
   ├─ animations[] { target, motion, at, duration_secs, easing }   ← quando e como
   ├─ captions { emphasis[], hidden }
   ├─ resources[] { id, description, license, optional }
   ├─ validation { spoken_terms[], min_visual_changes, max_still_secs, readable_without_audio }
   └─ transition (cut | fade | push | zoom)
```

### Composições (15)

| `kind` | Uso | Campos |
|---|---|---|
| `title` | gancho, pergunta, afirmação ou citação | `text`, `kicker` |
| `flow_diagram` | fluxo de etapas, com ou sem loop | `objects`, `relations`, `looped` |
| `comparison` | dois lados, item a item | `left_title`, `right_title`, `objects` com `group` = `left`/`right` |
| `timeline` | marcos em ordem | `objects` (label = marco, detail = texto) |
| `chart` | contador único ou barras | `title`, `objects` com `value`/`unit`, `max_value` |
| `architecture` | camadas e caixas de software | `objects` com `group` = camada, `relations` |
| `code` | demonstração de código | `language`, `lines` (≤ 18 × 48 caracteres), `file_name` |
| `transformation` | objetos que viram outros | `before`, `after`, `label` |
| `annotation` | árvore (pastas, arquivos) com notas | `objects` com `parent`, `notes` |
| `infographic` | cartões de dados | `title`, `objects` |
| `cause_effect` | causa → consequência, passos | `objects` |
| `steps` | checklist vertical numerada (espinha + cartões) | `objects` (2–6) |
| `character` | personagem que fala ao lado de um balão | `character` (`presenter`, `developer`, `scientist`, `robot`), `pose` (`explain`, `point`, `think`, `celebrate`), `text` (≤ 140), `persona` opcional (personagem descrito: `name`, `skin`, `hair`, `hair_colour`, `beard`, `beard_colour`, `outfit`, `colour`, `number`, `prop`, `glasses`, `laurel`) |
| `freeform` | cena livre, quando nenhum layout acima expressa a ideia | `elements` (1–24), ver abaixo |
| `stage` | palco contínuo: mascotes, uma metáfora física, um medidor que atravessa as cenas e tarefas que voam | `headline`, `actors`, `prop`, `meter`, `tasks`, `stamp`, ver abaixo |

#### Cena livre (`freeform`)

Cada elemento tem `id` e `shape`, com `kind` ∈ `card` (cartão, `text` ≤ 60 e `icon`
opcionais), `circle` (`text` ≤ 60 opcional), `text` (`text` ≤ 120, `size` ∈ `title`,
`heading`, `body`, `label`, `small`), `icon` e `arrow` (`from`/`to`). Posições em
**porcentagem da área de conteúdo** (`area {x, y, w, h}`, `x + w` e `y + h` ≤ 100), nunca
em pixels: a mesma cena se adapta a vertical, horizontal e X. O motor desenha só as
próprias formas (paleta por `role`, fontes embutidas); não há campo para SVG, HTML,
arquivo, URL ou script. Sem `animations`, a cena ganha as do planner: cada elemento entra
na ordem, na palavra narrada que corresponde ao seu texto, com destaque; setas são
desenhadas. Texto que não cabe, sai da área segura ou se sobrepõe a outro reprova no
mesmo QA de layout — rode `plan --storyboard` para ver em segundos. Exemplo:
[`examples/freeform.storyboard.json`](../examples/freeform.storyboard.json).

#### Palco (`stage`)

Em vez de um layout por cena, o vídeo vira **um plano contínuo** com estado: o que muda de
uma cena para a outra é o estado da metáfora, não o diagrama. Exemplo completo, nos dois
caminhos: [`examples/palco.storyboard.json`](../examples/palco.storyboard.json) (storyboard)
e [`examples/palco.roteiro.json`](../examples/palco.roteiro.json) (roteiro com `#palco`).

| Campo | Regra |
|---|---|
| `headline` | título fixo do bloco (≤ 48), em caixa alta; `*palavra*` sai na cor de destaque. Cenas seguidas com o mesmo título formam um **bloco**: corte sem emenda, sem câmera, nada entra de novo |
| `actors` | até 2 mascotes `{id, name ≤ 16, hat, role}`; `hat` ∈ `none`, `hard_hat`, `cap`, `glasses`, `crown`. O mesmo `id` na cena seguinte do bloco continua no lugar |
| `prop` | uma metáfora: `coin` (`label`, `rival` opcional que entra quando é dito; perde uma mordida por tarefa), `funnel` (`label`, `note`; as tarefas caem dele), `wall` (um tijolo por tarefa concluída), `table` (`title`, 1–3 `rows` `{label, value}`, `mark` circulado quando o valor é dito), `envelope` (`comment` digitado no campo de comentário: a chamada final) |
| `meter` | `{label, from, to, unit, numeric, style}` de 0 a 100; anda um passo por tarefa (ou no número dito, sem tarefas). `bar`: cartão com barra verde → amarela → vermelha, e o mascote cansa abaixo de 25; `badge`: pílula escura sob a moeda. Com `numeric` (padrão), o `to` **precisa ser dito**; `numeric: false` mostra só a barra |
| `tasks` | até 8 `{label ≤ 24, to, at}`: o rótulo aparece na palavra (`at`, ou a primeira palavra do rótulo dita), voa até `to` (um ator ou `prop`; padrão: o primeiro ator) e, ao bater, move o medidor, morde a moeda ou põe um tijolo |
| `stamp` | adesivo (≤ 24) que entra na palavra; dígitos precisam ser ditos (o sinal não: `-90%` vale com "90% a menos") |

Uma trilha no topo marca os blocos (feitos com ✓, o atual aceso). O palco se anima sozinho
a partir do tempo das palavras: `animations` fica vazio e o planner não planeja nada para ele.
Mascotes e objetos são desenhos vetoriais próprios do motor, iguais em todos os looks.

Cada objeto tem `id`, `label` (≤ 60 caracteres), `detail` (≤ 120), `role`
(`neutral`, `primary`, `secondary`, `accent`, `success`, `warning`, `danger`), `icon`
(catálogo fechado de 22 ícones vetoriais próprios), `value`/`unit`, `group`, `parent`.

### Look

`"look": "noite" | "papel" | "planta"` no topo do storyboard escolhe o visual (ausente =
o do canal, depois `noite`). Ver `docs/DESIGN_SYSTEM_VIDEO.md`, "Looks".

### Transição

`"transition"` de cada cena: `cut`, `flood`, `morph`, `expand`, `iris`, `blur_swap`, `dip_cut` (com causa;
o planner escolhe pela cena anterior) ou `push`, `fade`, `zoom`, `whip_pan`. Ver
`docs/DESIGN_SYSTEM_VIDEO.md`.

### Cues: quando algo acontece

| Cue | Significado |
|---|---|
| `"start"` | início da cena |
| `{"word": {"word": "decide", "occurrence": 0}}` | quando a palavra é dita (ocorrência n) |
| `{"segment": {"index": 1}}` | início da segunda frase |
| `{"fraction": {"fraction": 0.5}}` | metade da cena |
| `{"time": {"secs": 2.5}}` | segundos após o início |
| `{"end": {"before_secs": 1}}` | um segundo antes do fim |

Movimentos: `reveal`, `pop`, `draw`, `highlight`, `pulse`, `focus`, `count`, `grow`,
`move_to` (exige `destination`), `type`, `hide`, `breathe`. Easing: `linear`,
`ease_out`, `ease_in_out`, `ease_in`, `back`, `spring`.

### Regras que o validador impõe

- Toda animação aponta para um objeto existente (`*` vale para todos).
- Cue por palavra só para palavras presentes na narração da cena.
- Palavras de ênfase e `spoken_terms` precisam ser ditas na narração.
- **Todo número exibido (`value`) precisa ser dito na narração**: assim passa pela
  revisão de alegações, como já valia para `#numero` e `#citacao`.
- Textos têm limites de tamanho; o renderizador nunca corta com reticências — quando
  não cabe nem no piso de legibilidade, o QA reprova (`text_overflow`). `plan` e
  `produce` checam isso antes do TTS (`layout_preflight`; `plan` sai com código 2).
- Um storyboard escrito à mão ou por agente sem `animations` (ou sem ênfase de
  legenda) recebe os do planner ao entrar por `--storyboard`; o que foi escrito fica.
- Campos desconhecidos são rejeitados (`deny_unknown_fields`), então um modelo não
  consegue injetar comandos de render.

## Diretivas de roteiro (planner)

O autor do roteiro (pessoa ou modelo) escreve uma diretiva na primeira linha de
`visual_brief`; o planner a transforma em composição e planeja as animações:

| Diretiva | Composição |
|---|---|
| `#pergunta TEXTO` · `#destaque` · `#citacao FRASE \| AUTOR` | `title` |
| `#fluxo A -> B -> C` (`-> loop` fecha o ciclo) | `flow_diagram` |
| `#comparacao Lado: a; b \| Lado: c; d` | `comparison` |
| `#linha-do-tempo MARCO: texto; …` | `timeline` |
| `#grafico TÍTULO \| rótulo=valor[unidade]; …` · `#numero VALOR \| LEGENDA` | `chart` |
| `#arquitetura Camada/Caixa; Camada/Caixa2; Caixa -> Caixa2` | `architecture` |
| `#codigo linguagem [\| arquivo]` + linhas seguintes | `code` |
| `#transformacao a; b => c` | `transformation` |
| `#anotacao pasta/arquivo: nota; …` | `annotation` |
| `#infografico TÍTULO \| rótulo=valor: detalhe; …` | `infographic` |
| `#causa A => B => C` · `#lista A; B; C` | `cause_effect` |
| `#passos A; B; C` | `steps` |
| `#personagem PERSONAGEM \| POSE \| FALA` (fala opcional; padrão: título da cena) | `character` |
| `#palco TÍTULO *destaque*` + linhas `ator:`, `objeto:`, `medidor:`, `tarefas:`, `selo:` | `stage` |

Qualquer rótulo aceita um ícone `[agent]` e um papel `{primary}`. A linha seguinte do
`visual_brief` vira o `learning_goal` da cena.

**Personagens da pauta.** No lugar de um personagem pronto, o roteiro pode descrever quem
fala: `#personagem Sócrates (careca, barba longa branca, toga branca, pergaminho) | explicar | Só sei que nada sei`.
A descrição usa até 10 traços de um vocabulário fechado, e o motor desenha cada traço em
vetor, sempre igual:

| Traço | Palavras |
|---|---|
| Pele | `pele clara`, `pele media`, `pele morena`, `pele escura` |
| Cabelo | `careca`, `coque`, `cabelo curto`, `cabelo longo`, `cabelo cacheado`, com cor `preto`, `castanho`, `loiro`, `ruivo`, `grisalho`, `branco` |
| Barba | `bigode`, `cavanhaque`, `barba curta`, `barba longa`, com cor |
| Roupa | `camisa`, `terno`, `toga`, `jaleco`, `moletom`, `vestido`, `uniforme`, com cor `azul`, `vermelho`, `verde`, `amarelo`, `branco`, `preto`, `roxo`, `laranja`, `cinza`; um número de 1 a 99 vira camisa de time (`camisa 10 amarela`) |
| Objeto | `pergaminho`, `livro`, `bola`, `apito`, `microfone`, `notebook`, `frasco`, `trofeu` |
| Extras | `oculos`, `louros` |

- Descreva uma vez; nas cenas seguintes, o nome basta (`#personagem Sócrates | pensar`).
- O primeiro personagem descrito apresenta as cenas sem diretiva.
- O nome aparece no topo do balão e o personagem vai para a miniatura.
- Um traço fora da lista ou um nome nunca descrito não para a produção: a cena usa o layout
  padrão e o aviso diz o que corrigir.

O desenho nunca copia rosto, escudo, logotipo ou patrocinador: quem identifica o personagem
é o nome e os traços escolhidos. Figuras históricas podem falar com frases documentadas ou
claramente ilustrativas. **Pessoa viva** aparece por arquétipo (Camisa 10, Goleiro, Técnico)
ou com fala em terceira pessoa ou citação que esteja nas fontes: inventar fala em primeira
pessoa de alguém vivo, num vídeo monetizado, expõe o canal a pedido por uso de imagem.

**Personagens.** `#personagem` aceita `apresentador`, `dev`, `cientista` ou `robo` e as
poses `explicar`, `apontar`, `pensar` ou `comemorar`. Uma cena **sem diretiva** no motor
motion, ou com `#pergunta` (que vira o personagem pensando na pergunta), ganha o personagem da pauta: o planner procura radicais no título, no gancho e na
série (IA, agente, LLM → robô; código, software, skill, API → dev; pesquisa, estudo,
ciência → cientista; senão, apresentador). A pose segue a cena: título com `?` pensa, a
última cena comemora, as demais alternam explicar e apontar. `#destaque` mantém o título
tipográfico. Os personagens são figuras vetoriais genéricas desenhadas pelo motor, sem
arquivo externo nem semelhança com pessoas reais; enquanto a narração toca, a boca mexe,
os olhos piscam e o braço do gesto balança. Cada pose tem a sua expressão (sobrancelhas e
boca), e o dev, a cientista e o apresentador seguram um objeto do ofício.

**Palco.** As linhas abaixo de `#palco` descrevem a cena; qualquer outra linha é a nota
livre (vira o `learning_goal`).

```text
#palco Pare de queimar o seu *limite*
ator: Opus (capacete)
objeto: moeda Opus | rival Haiku
medidor: limite | 100 -> 40 % | selo
tarefas: listar pasta -> moeda; ler log -> moeda; raciocínio pesado -> Opus
selo: mais barato
```

| Linha | Forma |
|---|---|
| `ator:` | `Nome (capacete\|bone\|oculos\|coroa\|nenhum) {papel}`; até 2. Descreva o acessório uma vez; depois, o nome basta. O papel (cor do crachá) segue a ordem de entrada: `primary`, `secondary`, `accent`… |
| `objeto:` | `moeda RÓTULO \| rival RÓTULO` · `funil RÓTULO \| nota` · `muro` · `tabela TÍTULO \| a=1; *b=2*` (a linha entre `*` é circulada) · `envelope COMENTÁRIO` |
| `medidor:` | `RÓTULO \| 90 -> 20 % [\| selo]`. Sem o início (`\| -> 20 %`), começa onde o mesmo medidor parou na cena anterior (ou em 100). O número só é impresso quando a narração o diz; senão, só a barra |
| `tarefas:` | `a; b -> Nome; c -> objeto` |
| `selo:` | texto do adesivo |

Linha errada (acessório, objeto ou destino inexistente) faz a cena cair no layout padrão
com o motivo no relatório, como qualquer diretiva.

### Como o planner escolhe os tempos

1. O primeiro objeto entra no início da cena.
2. Cada objeto seguinte entra na **primeira menção** de uma palavra distintiva do seu
   rótulo (radical de 5 letras; "decide" casa com "decisão"). Palavras compartilhadas
   por dois rótulos ("skill", "agente") só valem em último caso.
3. Em sequências (fluxo, causa, linha do tempo, árvore, arquitetura) a ordem é
   monotônica: um passo nunca aparece antes do anterior, mesmo que a narração cite uma
   palavra do passo 4 antes do passo 3.
4. Objetos que a narração não menciona são distribuídos pelas frases.
5. Objetos mencionados recebem `highlight` na menção; arestas são desenhadas quando as
   duas pontas já existem; `breathe` mantém o quadro vivo entre eventos.

A duração de cada cena **vem do áudio**: a narração é sintetizada por frase, as
pausas entre frases (0,28 s) e entre cenas (0,45 s) são somadas, e os cues são
resolvidos sobre os tempos reais. O timing por palavra dentro de uma frase é
**estimado** por peso (letras, dígitos e pontuação) sobre o trecho sonoro medido;
`segments[].aligned = false` registra isso. Um alinhador forçado pode preencher os
mesmos campos com `aligned = true`.

## Exemplo

`examples/skills-vs-agentes.roteiro.json` é um roteiro com as diretivas acima;
`framechester plan --script … --topic … --format vertical` gera o storyboard e
`framechester produce` narra, renderiza e audita.
