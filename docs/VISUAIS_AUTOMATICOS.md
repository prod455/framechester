# Visuais explicativos locais

Na Produção, **Preparar vídeo** cria e vincula uma imagem por cena do roteiro
salvo. A biblioteca pode estar vazia. O operador confere as prévias e inicia
o vídeo; importar imagens e preencher sua procedência é necessário apenas
quando quiser usar arquivos próprios.

O fluxo principal agora é **Produzir com IA**: orientação e referência →
roteiro → visuais → narração → montagem → QA → revisão do vídeo. A associação
de cada cena acontece no servidor. A preparação individual descrita abaixo
fica em **Controles avançados → Abrir preparação manual**.

O motor Rust compõe PNGs em tema escuro com o nome do canal e um layout por
cena: 1920 × 1080 para vídeos longos e 1080 × 1920 para Shorts. O layout vem
da diretiva opcional na primeira linha do briefing visual (`#pergunta`,
`#numero`, `#lista`, `#comparacao`, `#linha-do-tempo`, `#citacao`); sem
diretiva, a cena mostra o título e um trecho da narração. Identidade,
regras e formatos de roteiro estão no [guia visual](GUIA_VISUAL.md). São
composições de texto, sem pesquisa de imagens ou geração fotográfica por IA.
Não há chamada de API, cobrança de provedor ou autorização de gasto nessa
etapa. O render e a voz continuam locais.

Toda cena recebe uma composição explicativa, inclusive quando o briefing
visual menciona gravação real, gravação de tela ou `CAPTURA PENDENTE`; o texto
livre do briefing não aparece na tela e o rodapé diz **Visual explicativo ·
trecho do roteiro**. Nenhuma cena exige arquivo próprio para a versão final.
Para usar uma gravação ou imagem sua, abra **Usar outro recurso visual** na
cena e escolha ou adicione o arquivo. O assistente de roteiro é instruído a
não pedir gravações nos briefings.

Os arquivos e vínculos ficam no canal. Preparar novamente um roteiro
inalterado reutiliza os arquivos íntegros. Mudanças no título, formato,
cenas, fontes ou nome do canal invalidam os vínculos automáticos antigos.
O original continua na biblioteca; um job não pode usar um vínculo obsoleto
como se fosse atual. A preparação não aprova fontes nem altera o roteiro.

As fontes e as alegações ainda precisam de revisão antes da produção. O
resultado mantém os gates de QA e revisão humana; imagens explicativas não
comprovam fatos nem garantem monetização. Os direitos do texto do roteiro
e das fontes tipográficas continuam aplicáveis.

Em uma timeline composta inteiramente por imagens, os frames parados que o
detector encontra são os previstos pela timeline: a verificação de
congelamento passa com essa anotação, e o ritmo fica a critério do
operador. Timelines com vídeo mantêm o bloqueio de congelamento; a CLI
`qa`, sem contexto da timeline, também mantém a análise estrita. Falhas de
decodificação, áudio ou tela preta continuam bloqueando a entrega.

## CLI e instalação

```powershell
cargo run -p framechester-cli -- visuals --input plano.json --output visuais
```

O JSON contém `channel`, `title`, `format` (`long` ou `short`) e `scenes`,
usando o contrato Rust de cena: `id`, `heading`, `narration`, `visual_brief`,
`duration_hint_secs`. A resposta JSON (renderer `framechester-editorial-v3`)
lista cada `scene_id` como `generated` com seu arquivo PNG, vinculado
automaticamente como visual da versão final.

O comando não precisa de TTS ou chaves. Precisa de fontes locais; o Docker
já inclui DejaVu Sans. Na instalação nativa são usadas Segoe UI, DejaVu Sans
ou Arial quando disponíveis. Reconstrua o motor e a web após atualizar:
`npm --prefix web run engine:build` e `npm --prefix web run build`.
