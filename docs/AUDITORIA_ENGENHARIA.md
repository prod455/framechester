# Auditoria de engenharia — Framechester

Data: 27/10/2026. Escopo: workspace Rust, contratos, QA, segurança local, DX,
DevOps e aderência ao produto. Auditoria por leitura de código, regressões
executáveis e smoke audiovisual sintético. Não constitui auditoria jurídica,
pentest ou certificação de prontidão de produção.

## Veredito

**Pronto com ressalvas para desenvolvimento e produção de provas locais em
dry-run; não pronto para produção editorial autônoma ou publicação real.**

O repositório é uma pré-alpha executável, com três crates Rust e verificadores
Python. O núcleo já possui interfaces de provedor, etapas do pipeline, TTS,
render, QA e pacote revisável. A separação core/adapters/CLI merece ser
preservada; reescrever tudo ou adicionar serviços distribuídos não resolve o
principal gargalo atual: conteúdo original e evidência editorial por vídeo.

O operador informou nesta conversa que o canal já está configurado. A auditoria
não consultou a conta nem verificou elegibilidade YPP. Ausência das variáveis
de OAuth neste processo não prova ausência de canal ou de configuração em outro
local. O pedido atualizado é operação com **múltiplos canais**, mantendo um
operador; isso requer isolamento de contexto, saídas e métricas por canal.
Autenticação de vários usuários é um requisito diferente.

## Fontes de verdade e estado observado

Foram consultados `AGENTS.md`, `docs/PLANO_OPERACIONAL_COMPLETO.md`,
`docs/OPEN_SOURCE_ARCHITECTURE.md`, `docs/00-inventario-e-viabilidade.md`,
`docs/04-arquitetura-e-adr.md` e `PROMPT_CODEX_CLAUDE.txt`, além de código,
testes, README e CI.

| Área | Observação verificável | Consequência |
|---|---|---|
| Arquitetura | `framechester-core`, `framechester-adapters`, `framechester-cli`; interfaces em `ports.rs` | Evoluir adaptadores sem acoplar o domínio a fornecedores |
| Infraestrutura | Pipeline local síncrono, sem fila durável, banco, serviço web ou scheduler | Não anunciar recuperação de jobs ou processamento concorrente durável |
| Editorial | `TemplateLlm` continua como demonstração; a nova porta `LocalAssetProvider` permite imagem/vídeo local declarado e íntegro | Render aprovado tecnicamente não comprova um vídeo comercial pronto |
| Fatos | `LocalEvidenceProvider` preserva estados e associa citações, sem verificar a web | Fonte citada continua distinta de fato verificado |
| Publicação | `DryRunPublisher` bloqueia solicitação real | Nenhum upload real foi realizado nesta auditoria |
| Dados | CLI usa `NullMetrics`; `FileMetricsProvider` oferece leitura local | Não existem resultados reais de canal demonstrados pela execução |
| UX/UI | Interface operacional atual é CLI mais `report.html` offline | Melhorar seleção, erros, estado e rastreabilidade antes de escolher framework web |
| DX | Rust instalado, mas `cargo` ausente do PATH desta sessão | Use o caminho local do toolchain ou configure PATH; não atribuir o erro ao código |
| Doctor | FFmpeg/ffprobe 9.0.1, Piper e modelo local disponíveis; ASR local presente e desativado | Ferramentas essenciais locais acessíveis; isso não certifica todos os fluxos |
| Backup | `restic` fora do PATH do processo; nenhum backup remoto executado | Prontidão de recuperação permanece separada da prontidão do renderer |

## Correções entregues com regressões

### QA técnico incompleto não autoriza publicação

Evidência original: `crates/framechester-core/src/pipeline.rs`, `Pipeline::run`,
no gate imediatamente anterior à geração do pacote. `Fail` bloqueava, porém
`NeedsHuman` ou `Skipped` técnico alcançavam o publisher se o editorial fosse
`Pass` e `dry_run=false`.

Teste `live_pipeline_blocks_incomplete_technical_qa`: falhou antes da correção
com etapa `EditorialQa` no lugar de `Blocked`; passou depois para ambos os
estados. O gate exige agora resultado global `Pass` nas duas dimensões para
uma solicitação real. Dry-run continua permitindo revisar material pendente,
sem transformar isso em autorização de upload.

### Claims não verificadas e manifestos incompletos não recebem Pass

Em `crates/framechester-core/src/qa.rs`, uma claim `Unverified` com URL não
entrava nas condições de falha nem de revisão pendente e era contada como
verificada. O teste `unverified_claim_with_source_cannot_pass_claims_check`
reproduziu a falha e passou após a correção.

O cálculo anterior de assets retornava `assets.len()` quando a quantidade
divergia das cenas: com zero assets, retornava zero pendências. A regressão
`missing_all_assets_fails` falhou e passou após a correção. A refatoração também
confere uma associação única por `scene_id`, metadados obrigatórios e rejeita
assets referentes a cenas inexistentes. A regressão
`each_scene_requires_its_own_asset_manifest` reproduziu os casos duplicado e
ID desconhecido antes da alteração.

Esses testes exercitam `qa::editorial` por sua interface pública. A revisão
editorial humana permanece obrigatória: metadados preenchidos não provam que
uma licença é válida nem que uma afirmação é verdadeira.

### Break-even usa receita líquida de imposto

Em `crates/framechester-core/src/finance.rs`, `simulate`, o ponto de equilíbrio
usava RPM bruto mesmo quando o relatório descontava tributos da receita.
O caso conhecido com custo de 248 centavos, RPM de 600 centavos e imposto de
10% esperava 414 views; a expectativa correta do cenário contínuo conservador
é **460 views**. A expectativa corrigida falhou com 414 antes da implementação
e passou depois.

Fórmula aplicada: `ceil(custo_caixa_centavos × 1000 × 10000 /
(RPM_centavos × (10000 − imposto_bp)))`, com intermediários `u128`.
Imposto de 100% não tem RPM líquido positivo: o resultado é `None`. A
regressão adicional `no_breakeven_without_positive_net_rpm` verifica esse caso.

O indicador permanece explicitamente o cenário de longos cobrindo todo o
custo de caixa. Não abate outras receitas, não estima views futuras e não é
ponto de equilíbrio econômico. A simulação continua distinta de valores
recebidos. A tabela de preços de armazenamento é uma premissa do modelo,
não uma cotação atual validada por esta auditoria.

### Renderer usa imagens e vídeos locais autorizados pelo operador

Foi implementado `crates/framechester-adapters/src/local_assets.rs`, com
`LocalAssetProvider::from_json_file` e a porta `AssetProvider`. O JSON é um
array de `AssetManifest`, com `scene_id`, `kind` (`image` ou `video`), `path`,
`license`, `provenance`, `checksum` SHA256 e `restrictions` explícitos.
Cada caminho é relativo ao diretório do manifesto; caminhos absolutos,
travessia para diretório pai e escape por resolução canônica são rejeitados.
Duplicatas por cena, manifesto vazio, arquivo ausente, formato incompatível,
metadados vazios e hash divergente falham. O hash é conferido na carga,
na resolução da cena e na entrada do renderer. Não há download de mídia.

O renderer anteriormente ignorava `assets` e sempre gerava `testsrc2` ou cor.
Agora vincula o manifesto por cena, aplica loop de imagem/vídeo, mapeia apenas
o áudio da narração, ajusta escala com proporção preservada e padding, SAR,
fps e formato `yuv420p`. Mantém as cenas sintéticas como opção explícita de
demonstração. Não transforma tipo desconhecido em fallback sintético.

Entradas visuais locais usam protocolos `file,pipe` e demuxer determinado pelo
tipo/extensão, sem tratar uma playlist arbitrária como vídeo remoto. Formatos
implementados: PNG/JPG/JPEG/WebP/BMP; MP4/MOV/M4V/MKV/WebM/AVI. A opção não é um
sandbox para mídia hostil: atualizações do FFmpeg e validação do ambiente
continuam necessárias. Declarações de licença não substituem prova jurídica
de autorização ou verificação editorial humana.

A remoção recursiva da pasta `scenes` foi retirada; entradas que conflitam com
o diretório intermediário ou arquivo final são bloqueadas. A lista de concat
usa somente arquivos do job corrente. O fallback de fonte/drawtext preserva
os filtros obrigatórios de normalização.

O teste real `renders_local_image_and_video_instead_of_test_pattern` falhou
antes da implementação: o pixel da saída correspondia ao test pattern, não à
imagem fornecida. Passou depois, verificando por pixels as duas fontes,
loop de um clipe de 0,3s numa cena de 1s, áudio presente, 160×90 a 30fps e
aproximadamente 2s finais. Todos os insumos foram gerados pelo próprio teste.
Ele é ignorado no teste unitário padrão porque requer FFmpeg/ffprobe, mas foi
executado explicitamente com `-- --ignored` e passou neste ambiente.

Imagem estática prolongada ainda pode reprovar o detector de freeze. Isso é
um resultado de QA a revisar, não uma autorização para desativar o gate.
Esta fatia não adiciona música, montagem automática de b-roll, motion design,
busca de mídia ou autorização de publicação.

### Debug do adapter Anthropic não expõe credenciais

O `Debug` derivado de `AnthropicLlm` incluía o campo `api_key` e o endpoint
configurado. A regressão
`debug_redacts_api_key_and_private_endpoint_credentials` usou somente valores
fictícios e falhou ao detectar a chave no texto formatado. Depois da correção,
o Debug customizado mostra o nome do modelo e `[REDACTED]`, omitindo cliente,
endpoint e nome da variável de segredo. A mesma regressão passou.
Nenhuma requisição de rede foi feita. Não foi encontrado logging anterior
desse objeto no caminho atual; a correção fecha a exposição quando ele é
formatado em diagnóstico futuro.

O risco monetário recebeu bloqueio fail-closed no próprio adapter:
`AnthropicLlm::generate` chama `preflight` antes de montar/enviar o POST.
Orçamento zero permanece `InvalidInput`; orçamento positivo retorna
`Unavailable`, explicando que cotação confiável e enforcement de custo ainda
não foram implementados. Nenhum valor positivo habilita a inferência paga e
não existe flag de bypass. O código HTTP permanece atrás dessa fronteira para
uma implementação futura completa; ele não está habilitado pela mera flag
`max_cost_cents`. O fluxo de roteiro local revisado continua disponível.

A regressão pública `positive_budget_without_trusted_quote_blocks_before_http`
construiu adapter com credencial fictícia e endpoint loopback indisponível.
Antes da correção, falhou porque o resultado era erro externo de conexão;
depois, passou com a classe e mensagem de preflight esperadas, sem tentativa
de POST. Nenhuma API externa ou inferência paga foi chamada.

### Erro dos scanners FFmpeg não se transforma em QA aprovado

O método `FfmpegQa::technical` foi exercitado por sua interface pública com
executáveis locais controlados: os helpers devolvem metadados válidos de
ffprobe, mas terminam com exit 7 em `blackdetect`, `freezedetect` ou
`volumedetect`. Mesmo no caso de volume, emitem `max_volume: -3.0 dB` parcial.
Antes da correção, cada caminho produzia relatório com checks `Pass`.

Agora scans de vídeo e volume exigem exit de sucesso com `require_success`
antes de interpretar stderr. Erro devolve `External` com contexto do filtro e
aborta a avaliação; ausência de detecção parcial não é evidência de aprovação.
As regressões `failed_video_scans_abort_technical_qa` e
`failed_volume_scan_cannot_pass_from_partial_volume_output` tiveram RED e
GREEN reais. Os helpers são arquivos temporários sintéticos, sem rede ou mídia
privada; o ramo Windows foi executado neste ambiente.

Também foi corrigido o aceite de qualquer codec presente: o vídeo precisa
corresponder ao codec do encoder solicitado (incluindo aliases testados de
`libx264`/`h264_amf` para H.264 e `libx265` para HEVC), e o áudio precisa ser
AAC, conforme o renderer atual. A regressão
`unexpected_video_or_audio_codec_fails_the_requested_profile` reproduziu VP9
em perfil x264 e PCM no lugar de AAC aprovados indevidamente. Agora ambos
falham; `encoder_aliases_match_their_probed_codec_names` preserva casos válidos.

O smoke real já existente foi ampliado e executado: render com fontes locais
passa no QA técnico, e vídeo preto sintético de 3s reprova o check `black`.
Isso verifica os subprocessos reais além dos helpers. Timeout genérico,
clipping, loudness, conformidade completa do áudio e avaliação editorial
continuam fora desta correção.

## Achados remanescentes por prioridade

Nenhum P0 foi confirmado neste escopo. Isso não equivale a ausência de
vulnerabilidades. As prioridades abaixo distinguem falhas observadas por
leitura e capacidades ainda não implementadas.

| ID / prioridade | Evidência | Impacto e próximo aceite |
|---|---|---|
| ENG-04 / P2 residual | `TemplateLlm` permanece demonstração; `AuthoredScriptLlm` permite narração original; `editorial.rs` e `qa.rs` exigem URLs distintas e referências pertencentes ao inventário | Vínculo documental não comprova verdade, independência ou originalidade semântica. Manter revisão humana e desenvolver comparação entre vídeos antes de produção editorial autônoma |
| ENG-06 / P2 | `crates/framechester-adapters/src/ffmpeg.rs:42`, subprocessos sem timeout; perfil de áudio ainda sem validação completa | Ferramenta travada pode bloquear execução. Introduzir timeout/cancelamento e critérios adicionais de áudio; testar comando que excede prazo sem consumir recurso indefinidamente. A comparação de codecs vídeo/AAC foi corrigida nesta entrega |
| ENG-07 / P2 | `.github/workflows/ci.yml`: fmt, clippy, testes Rust e Python em Linux | Falta executar as etapas de secrets/licenças/vulnerabilidades exigidas para release; falta matriz Windows e render smoke em CI. Adicionar controles apropriados, sem credenciais ou redes pagas, e distinguir proteção de PR de autorização de release |
| ENG-08 / P2 | `crates/framechester-core/src/security.rs`, `validate_source_url`: análise textual de host e bloqueios estáticos | Não é proteção completa de fetch contra redirects/DNS rebinding. Não reutilizar isoladamente como garantia SSRF em futuro downloader; validar destino e cada redirect na camada de rede |
| ENG-09 / P2 residual | `analytics.rs` e comando `analytics` importam snapshot JSON local por canal, janela e formato; pipeline ainda usa `NullMetrics` | Importação local conserva origem, receitas e engaged views. Faltam leitura real autorizada da API ou normalização direta de export Studio, reconciliação e histórico durável; fixtures não comprovam lucro |
| ENG-10 / P2 | `crates/framechester-core/src/pipeline.rs`, `write_report` e execução sequencial | Estado reside em memória e arquivos regraváveis. Antes de jobs agendados, implementar IDs estáveis, persistência/recovery e idempotência; teste de interrupção em cada fronteira de efeito externo |

O adapter pago está bloqueado mesmo com configuração e orçamento positivo;
nenhuma API externa foi chamada. O publisher
atual só faz dry-run; a correção do gate protege também a evolução futura das
portas, sem alegar que já exista publicador real.

ENG-01 está fechado como risco de cobrança involuntária por esta fatia: chamadas
pagas foram bloqueadas no preflight, inclusive com budget positivo. O recurso
de cotação/enforcement ainda não existe e permanece no backlog FIN-QUOTE-01.
ENG-02 foi fechado pela validação do exit dos scans de vídeo e volume antes da
interpretação de stderr. ENG-05 foi fechado pela redaction do Debug. Esses fechamentos não equivalem à
disponibilidade de inferência paga ou certificação de segurança do adapter.

### Backlog FIN-QUOTE-01 — cotação, count_tokens e ledger antes de inferência paga

- **Responsável:** engenharia Rust com finanças e QA.
- **Problema:** a intenção de orçamento não fornece preço, contagem de entrada
  ou garantia de custo de uma requisição real.
- **Entrega:** tarifas configuradas e datadas por modelo/moeda, validade da
  cotação, conversão monetária explícita, contagem de entrada pelo mecanismo
  oficial vigente, pior caso da saída e margem técnica justificada. Não
  hardcode preços voláteis nem deduza crédito de API de assinatura pessoal.
- **Ledger local:** reservar orçamento por canal/job antes do efeito externo;
  registrar uso observado e estimado separadamente, conciliar resposta/erro e
  limitar concorrência/retries para não duplicar consumo.
- **Aceite:** preço ausente/vencido, modelo sem tarifa, contagem indisponível,
  overflow, cotação acima do orçamento e reserva concorrente insuficiente
  falham antes do POST. HTTP fake cobre sucesso, timeout e resposta parcial;
  testes não usam credenciais reais ou chamadas pagas. A alegação de limite
  deve distinguir guard local estimado de limite imposto pelo provedor.
- **Ativação:** manter o bloqueio atual até implementar e revisar a fatia
  completa, atualizar documentação e obter autorização para qualquer validação
  com cobrança real.

## Correções finais integradas

ENG-03 foi fechado com regressões públicas: restore Rust exige destino novo/vazio, sem link, e rejeita qualquer retorno nãozero do restic. Arquivo pré-existente, substring de timestamp ou conteúdo parcial não transformam falha em sucesso. Na falha, o destino é descrito como potencialmente parcial. No retorno zero, avisos de timestamp podem ser reportados sem alegar comparação independente de todo o manifesto. O verificador Python também rejeita retorno nãozero antes de checar os dois arquivos sintéticos; no sucesso mantém presença e SHA256 obrigatórios. Testes usam executáveis locais controlados ou mocks, sem restic remoto.

A revisão final do core acrescentou três regressões que falharam antes da correção: claim apontando para URL fora do inventário da pauta, repetição da mesma fonte para satisfazer quantidade e claim fora das fontes do roteiro. Os três agora bloqueiam. URLs distintas são um critério sintático, não prova de independência editorial.

O recibo de dry-run conserva `published_at_unix = null`; uma simulação não recebe data de publicação. A regressão de `DryRunPublisher` reproduziu a data indevida e passou após a correção.

## Evidências de execução

Toolchain encontrado em `C:\Users\dev\.cargo\bin\cargo.exe`, versão 1.99.1.
Os comandos Cargo abaixo usaram esse executável explicitamente.

| Verificação | Resultado observado |
|---|---|
| `cargo test --workspace` antes da implementação | PASS: 80 testes, sendo 47 core, 28 adapters e 5 CLI |
| `cargo test -p framechester-core live_pipeline_blocks_incomplete_technical_qa` | RED reproduzido; GREEN depois da correção |
| `cargo test -p framechester-core unverified_claim_with_source_cannot_pass_claims_check` | RED reproduzido; GREEN depois da correção |
| `cargo test -p framechester-core missing_all_assets_fails` | RED reproduzido; GREEN depois da correção |
| `cargo test -p framechester-core each_scene_requires_its_own_asset_manifest` | RED reproduzido; GREEN depois da correção |
| `cargo test -p framechester-core qa::tests` | PASS: 9 testes |
| `cargo test -p framechester-core revenue_taxes_and_breakeven` com expectativa corrigida | RED 414 versus 460; GREEN depois da correção |
| `cargo test -p framechester-core finance::tests` | PASS: 10 testes |
| `cargo build --workspace` após fatias QA/finance | PASS |
| `cargo clippy --workspace --all-targets -- -D warnings` após fatias QA/finance | PASS |
| `framechester doctor --json` | Exit 0, todos os checks críticos OK; restic ausente do PATH é aviso |
| `framechester qa --video artifacts/audit-qa/moving.mp4 --json` | Exit 0; 10 checks técnicos Pass |
| `framechester qa --video artifacts/audit-qa/black.mp4 --json` | Exit 1 esperado; black e freeze Fail |
| `cargo test -p framechester-adapters local_assets::tests` | PASS: 5 testes; casos inválidos tiveram RED antes da implementação |
| `cargo test -p framechester-adapters renderer_rejects_missing_scene_asset_before_invoking_ffmpeg` | RED reproduzido; GREEN após validação prévia |
| `cargo test -p framechester-adapters renders_local_image_and_video_instead_of_test_pattern -- --ignored` | RED por pixel incorreto; GREEN com imagem/vídeo reais fornecidos pelo teste |
| `cargo test -p framechester-adapters ffmpeg::tests` após fatia local | PASS: 9 testes; smoke ignorado por padrão e executado separadamente |
| `cargo clippy -p framechester-adapters --all-targets -- -D warnings` após fatia local | PASS |
| `cargo test -p framechester-adapters debug_redacts_api_key_and_private_endpoint_credentials` | RED detectou chave fictícia no Debug; GREEN após redaction, sem chamada de rede |
| `cargo test -p framechester-adapters positive_budget_without_trusted_quote_blocks_before_http` | RED por erro externo de conexão; GREEN por bloqueio de preflight antes do POST |
| `cargo clippy -p framechester-adapters --all-targets -- -D warnings` após bloqueio pago | PASS |
| `cargo test -p framechester-adapters ffmpeg::tests` após correção dos scanners | PASS: 13 testes; 1 smoke ignorado no padrão |
| `cargo test -p framechester-adapters renders_local_image_and_video_instead_of_test_pattern -- --ignored` após correção dos scanners | PASS: fontes locais e QA positivo; fixture preta negativa confirmada |

As duas mídias do smoke foram geradas com FFmpeg, fontes `testsrc2` ou
`color=black`, áudio `sine`, duração de 3 segundos, 1920×1080 a 30fps,
libx264 ultrafast e AAC. São artefatos locais ignorados pelo Git, sem conteúdo
pessoal. Não representam avaliação perceptual de um episódio real.

Durante a implementação paralela de múltiplos canais, uma segunda execução
ampla encontrou os novos testes CLI deliberadamente em RED; foi interrompida.
`fmt --check` nesse intervalo acusou apenas formatação dos testes em edição.
Esses resultados intermediários não são aceitação da integração final. A
validação final do conjunto deve ser registrada pelo integrador depois de
concluir a fatia de canais; não reutilizar o baseline de 80 como contagem final.

Não foram executados: upload real, leitura autenticada de métricas do canal,
inferência paga, backup remoto, auditoria de todo o histórico Git, pentest,
benchmark CPU/GPU novo ou avaliação humana completa de vídeo curto e longo.

## Sequência recomendada de execução

1. **Engenharia e QA:** concluir e verificar isolamento de múltiplos canais;
   manter identificador explícito em produção, pacote, relatório e métricas.
   Canais diferentes não devem compartilhar arquivos finais ou aprovação.
2. **QA/SRE:** preservar as regressões de restore e scanners corrigidos;
   acrescentar comparação independente de manifesto completo antes de considerar
   recuperação automatizada integralmente verificada.
3. **BA/PA/editorial:** produzir um episódio original e um curto complementar,
   com fontes, contribuição própria, storyboard e revisão registrada. Medir
   minutos humanos e tempo total em vez de apenas contar renders.
4. **CEO/finanças:** estabelecer teto explícito de custo e horas por canal;
   manter receita desconhecida como desconhecida e receita de anúncios
   estimada em zero sem elegibilidade confirmada. Implementar FIN-QUOTE-01 antes
   de retirar o bloqueio do adapter pago.
5. **Dados/marketing:** importar observações oficiais por canal e período,
   testar uma hipótese editorial de cada vez e alimentar prioridades com
   retenção, satisfação e custo reais. Não inferir resultado de exemplos.
6. **DX/UI/DevOps:** melhorar onboarding, diagnóstico e relatório local com
   erros acionáveis; expandir CI e recuperação antes de adicionar um painel
   remoto ou processo distribuído.

## Reversão das fatias

As mudanças QA/finance não alteram banco nem exigem migração. Para reversão,
reverter somente os trechos e testes dessas fatias em `pipeline.rs`, `qa.rs`
e `finance.rs`, preservando alterações independentes de canais feitas em
paralelo. Não usar reset destrutivo do workspace compartilhado. A reversão
restaura as falhas documentadas e não é recomendada para habilitar publicação.
