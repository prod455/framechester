# Guia visual e formatos de vídeo

Este guia define como fica o visual dos vídeos gerados e como o roteiro se
adapta ao formato escolhido. A direção é a de canais dark de tecnologia e
ciência: fundo escuro, uma ideia por tela, tipografia grande e um único
acento de cor.

## A ideia do A2UI, sem o protocolo

Do A2UI vem só o princípio: **o roteiro declara dados, o renderizador decide
a aparência**. O modelo escolhe um layout de um catálogo fechado e preenche
campos tipados. Ele não escreve SVG, HTML nem coordenadas, e não consegue
pedir um componente que não existe.

O protocolo completo não entra: não há streaming de UI, árvore de componentes,
catálogo negociado nem cliente interativo. O vídeo é renderizado uma vez, e
uma diretiva de uma linha resolve o problema.

```text
roteiro (visualBrief) ──► diretiva #layout ──► planner Rust ──► storyboard ──► SVG por quadro ──► FFmpeg
                              │
                              └─► mesmo parser em TS: rejeita no salvar e na geração
```

- Parser oficial: `crates/framechester-core/src/planner.rs` (motor motion)
- Espelho no Studio: `web/shared/scene-layouts.ts`
- Casos compartilhados pelos dois testes: `tests/fixtures/scene-layouts.json`

## Motor motion

Todo vídeo sai do motor motion (`framechester produce`, ou `run` no Studio), que usa
um storyboard semântico com cenas animadas. Ele aceita as diretivas abaixo e, além delas, `#fluxo`, `#grafico`, `#arquitetura`, `#codigo`,
`#transformacao`, `#anotacao`, `#infografico`, `#causa`, `#personagem` e `#palco`
(palco contínuo com mascotes, uma metáfora e um medidor que atravessa as cenas; veja
abaixo).

**Formato escolhido pela narração.** Entre a primeira e a última cena, uma cena sem
diretiva ganha o formato que a fala pede, sem o roteirista escrever nada:

| A narração tem | Vira |
|---|---|
| um número só, ou vários e o título da cena repete um deles | `#numero` com o trecho da frase como legenda |
| 3 a 6 frases, duas ou mais abertas por "first/then/finally" ("primeiro/depois/por fim") | `#passos` |
| 2 a 4 frases, cada uma depois da primeira aberta por "so/which means" ("por isso/então") | `#causa` |

Texto longo demais para caber numa caixa (legenda acima de 60 caracteres) ou uma inferência
que não passa na validação deixa a cena com o personagem. Uma cena sem
diretiva ou com `#pergunta` é contada por um personagem animado que combina com a pauta (robô, dev,
cientista ou apresentador); `#destaque` mantém o título tipográfico. Gramática completa em
[STORYBOARD.md](STORYBOARD.md); direção de arte em
[DESIGN_SYSTEM_VIDEO.md](DESIGN_SYSTEM_VIDEO.md).

## Diretivas

A primeira linha do campo **O que aparece na tela?** (`visualBrief`) pode ter
uma diretiva. O restante do campo continua sendo nota livre para o operador.

| Diretiva | Uso | Regras |
|---|---|---|
| *(nenhuma)* ou `#destaque` | título da cena + trecho da narração | comportamento anterior |
| `#pergunta TEXTO` | gancho, loop aberto | 1 campo |
| `#numero VALOR \| LEGENDA` | um dado de escala | VALOR tem dígito e até 16 caracteres, e **precisa ser dito na narração da cena** |
| `#lista A; B; C` | passos ou itens | 2 a 5 itens |
| `#comparacao RÓTULO: texto \| RÓTULO: texto` | dois lados | dois `rótulo: texto` |
| `#linha-do-tempo MARCO: texto; …` | evolução histórica | 2 a 5 marcos |
| `#citacao FRASE \| ATRIBUIÇÃO` | frase documentada | FRASE **precisa ser dita na narração** |

Cada campo aceita até 160 caracteres; em `#comparacao` e `#linha-do-tempo`,
o rótulo antes dos dois-pontos aceita até 40 e o texto depois, até 160. Uma
diretiva desconhecida ou mal formada (`#grafico`, `#Lista`, `#lista só um`,
`#destaque com texto`) **nunca impede nada**: a linha vira nota livre e a
cena usa o visual padrão. O editor mostra o motivo abaixo do campo e o
relatório do motor registra "layout padrao usado". `# Título` com espaço é
tratado como nota em Markdown.

Por que números e citações precisam estar na narração: assim, o que aparece
na tela também passa pela revisão de alegações do roteiro. Sem essa regra,
um número poderia aparecer só na imagem, sem fonte.

## Identidade

| Token | Valor | Uso |
|---|---|---|
| Fundo | `#0B0F17` | todas as telas |
| Tinta | `#EEF2F8` | títulos e texto |
| Secundário | `#8C99AE` | canal, contador, rodapé, atribuição |
| Régua | `#243041` | divisores e trilhos |
| Acento | `#F2B544` | só no foco da tela: número, rótulo, marcador, aspas |

- Fonte: Segoe UI → DejaVu Sans → Arial, a primeira instalada. Título em bold, o resto em regular.
- Longo 1920×1080: margem de 112 px, título de 88 px, texto de 44 px.
- Short 1080×1920: margem de 82 px, título de 72 px, texto de 48 px.
- A faixa inferior (290 px no longo, 470 px no Short) fica livre para as
  legendas queimadas. Nenhum layout entra nela: o texto diminui de tamanho
  até caber e, no tamanho mínimo, é cortado com reticências. Um teste
  renderiza cada layout com todos os campos no limite, nos dois formatos, e
  confere o limite inferior.
- Um número nunca é cortado: a fonte diminui até caber em uma linha. Trocar
  "175 bilhões" por "175…" mudaria o sentido.
- `#lista` usa duas linhas por item quando há espaço; com cinco itens longos
  no formato longo, cai para uma linha por item. Itens curtos ficam melhores.

Para ver cada layout nos dois formatos, gere as prévias localmente (não ficam no
repositório): `cargo run --release -p framechester-motion --example preview_components -- artifacts/previas`.

## Formatos de roteiro

No assistente de criação e em **Produzir com IA**, o campo **Formato do vídeo**
injeta no prompt a estrutura, o ritmo e os layouts preferidos do formato
escolhido. Esse campo vale para Ollama, Claude e OpenAI, porque entra no
prompt do sistema e não depende do provedor. O catálogo fica em
`web/shared/video-styles.ts`.

| Formato | Estrutura | Layouts |
|---|---|---|
| Explicador direto | pergunta → resposta curta → mecanismo em 3 passos → exemplo → consequência | pergunta, lista, comparacao |
| Mistério documental | abertura fria → contexto → pistas encadeadas → explicação popular falha → virada documentada | pergunta, linha-do-tempo, citacao, numero |
| Ranking | critério → itens do menor para o maior → primeiro lugar por último | lista, numero |
| Linha do tempo | gancho no presente → origem → marcos → virada → pergunta em aberto | linha-do-tempo, citacao |
| Comparativo | decisão real → critérios → um critério por cena → veredito por perfil | comparacao, numero, lista |
| Dor e solução | número que assusta → negação → 3 exemplos da dor → custo por ano → solução real → solução na tela → 3 palavras → virada verdadeira + chamada | numero, personagem, palco, transformacao, destaque |

Regras por duração, somadas ao formato:

- **Short:** a 1ª cena dura até 3 s e já mostra a pergunta ou o fato. Uma ideia por vídeo, frases curtas, e a última fala retoma o gancho.
- **Longo:** a promessa aparece nos primeiros 30 s, um dado ou virada novo a cada 60–90 s, e há uma recapitulação antes da conclusão.

**De onde vêm (pesquisa de 05/11/2026).** Não há estudo público que compare formatos
editoriais por retenção: as fontes sobre Shorts que circulam são blogs de ferramentas com
percentuais sem dataset publicado, e só concordam em dois pontos: o gancho precisa estar
nos primeiros 1 a 3 segundos, e quem decide é a curva de retenção do próprio canal (desde
31/03/2025 a visualização de Short conta sem tempo mínimo, então views não medem retenção).
Por isso a direção criativa traz princípios, não formatos de sucesso: o que funciona no
canal se mede na curva de retenção dele.

**Limite honesto:** esses formatos reúnem convenções recorrentes do gênero
faceless de tecnologia e ciência. Ninguém mediu o desempenho deles neste
projeto, e eles não foram treinados em dados de canais. Antes de tratar um
formato como vencedor, compare a retenção por formato no analytics do
próprio canal (skills `youtube-channel-analysis` e `marketing-experiments`).
Para um teste interpretável, mantenha o assunto e a duração e mude só o
formato.

### Direção criativa livre

Formato editorial é opcional ("Sem formato definido" é o padrão). Em roteiro e narrativa, a
IA sempre recebe uma **direção criativa livre** (`web/shared/creative-direction.ts`): os
princípios que se repetem nos explicadores que seguram atenção, sem molde de cenas. Cada
vídeo inventa a própria ideia e combina os componentes do motor que servem a ela:

1. uma ideia visual por vídeo: metáfora física própria do assunto e algo que muda de estado;
2. o primeiro segundo já é o conflito;
3. o que a narração cita aparece na tela quando é dito;
4. causa e efeito visível;
5. mudança na tela a cada 2–3 s, frases curtas;
6. cada bloco termina numa tensão que o próximo resolve;
7. a solução entra como algo novo e o estado muda de comportamento;
8. a última imagem responde à primeira;
9. elenco e metáfora contínuos.

**Identidade do canal.** No cadastro do canal (Studio → Canais), **Cor do mascote**,
**Formato do mascote** e até 3 **personagens do elenco** com acessório valem para todos os
vídeos dele. O motor desenha o mascote com essa cor e silhueta, o planner já conhece o
elenco (o roteiro escreve só `ator: Nome`) e a IA recebe o elenco como fixo do canal. A ideia
de cada vídeo continua nova; o que se repete é quem conta.

A regra explícita é não copiar estrutura, títulos, personagens, metáforas ou sequência de
cenas de vídeos de outros canais. `#palco` é o componente para estado contínuo com elenco
([STORYBOARD.md](STORYBOARD.md#palco-stage)); nenhum componente é obrigatório.

## Precisa de um LLM próprio?

Não. Para este problema, seria usar um canhão para matar um mosquito.

| Opção | Custo | Quando faz sentido |
|---|---|---|
| **Formato no prompt + catálogo fechado** (atual) | zero | agora: resolve estrutura, ritmo e visual com Ollama, Claude ou OpenAI |
| Exemplos do próprio canal (few-shot) | zero, ~2–4 mil tokens por chamada | quando houver 3 a 5 roteiros **revisados** com boa retenção |
| LoRA em modelo aberto de 7–8B, servido como GGUF no Ollama | 1 GPU de 16–24 GB por algumas horas, ou aluguel pontual | só com centenas de roteiros revisados e se o few-shot estiver caro ou inconsistente no modelo local |
| Treinar um modelo do zero | ordem de milhões de dólares em computação e dados | nunca, para este caso |

A voz do canal é estilo, e estilo se ensina com exemplos. O conhecimento
factual vem das fontes da pauta, e nenhum ajuste fino substitui a checagem.
Um LoRA aprende o tom, mas também pode aprender a inventar com mais
confiança, então os gates de alegações e o QA continuam valendo do mesmo
jeito.
