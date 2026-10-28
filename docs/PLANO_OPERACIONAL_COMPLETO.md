# Framechester — plano operacional completo (Open Source)

> Atualizacao do operador em 27/10/2026: o produto deve operar **multiplos canais**, com contexto, artefatos, credenciais e metricas separados. Referencias abaixo a um unico canal descrevem o piloto historico e nao limitam a arquitetura atual. Ver [equipes e execucao](EQUIPES_E_SKILLS.md), [auditoria](AUDITORIA_ENGENHARIA.md) e [marketing multicanais](MARKETING_YOUTUBE_OPERACIONAL.md).
**Versão:** 4.0 • **Data-base:** 27/10/2026 • **Proprietário e beneficiário:** uma única pessoa física no Brasil • **Status:** especificação pública open-source; NÃO é um software implementado nem uma plataforma hospedada.

> **Contrato de negócio:** receita apenas da monetização oficial das plataformas (anúncios e programas de remuneração por audiência, incluindo YouTube Premium). Proibidos no escopo: prestação de serviços, clientes, afiliados, links de vendas, produtos, patrocínios negociados e licenciamento de vídeos para terceiros. Sem aparecer em câmera. Conteúdo original, verificável e permitido pelas regras de cada plataforma.


## Política open-source e escopo (decisão 4.0)

**Framechester** é um **software livre e de código aberto, auto-hospedável**, para pesquisar tendências, desenvolver roteiros com fontes, produzir vídeos originais, verificar qualidade, organizar publicações permitidas e analisar monetização por audiência. O repositório é público, **mas cada instalação, canal, chave, receita e conteúdo do usuário é privado por padrão**. Não existe serviço de hospedagem obrigatório, plano comercial, clientes ou afiliados no negócio pessoal do criador.

- **Licença de origem (proposta adotada para os arquivos próprios): Apache-2.0**, com arquivo `LICENSE` integral e cabeçalhos SPDX onde fizer sentido. Permite fork, uso comercial, modificação e distribuição, respeitadas as condições da licença; não obriga publicar alterações derivadas. Se a preferência passar a ser obrigar abertura de modificações oferecidas pela rede, discutir AGPL-3.0 **antes** de mudar a licença — não realizar relicenciamento automático de contribuições.
- **Avisos de terceiros:** FFmpeg, modelos, checkpoints, tipografias, vídeos e músicas têm licenças independentes. O app *invoca* FFmpeg como processo separado no MVP, em vez de incorporar binários potencialmente incompatíveis. Em caso de redistribuição de binários, cumprir licença/configuração exatas. Não declarar que Apache-2.0 cobre ativos de terceiros.
- **Multiusuário NÃO é requisito do MVP:** é um programa self-hosted single-operator configurável que qualquer pessoa pode instalar por conta própria. Evitar SSO/SaaS/billing/tenants/multi-tenant/analytics coletados centralmente.
- **API agnóstica:** provedores de pesquisa, IA/LLM, voz, armazenamentos e publicadores por interfaces; implementações locais por padrão, adaptadores online opcionais, desligados sem configuração e consentimento. Não tornar obrigatório um serviço pago.
- **Telemetria desligada:** não transmitir dados pessoais nem enviar eventos para servidores dos mantenedores. Diagnósticos exportáveis localmente com anonimização explícita e consentimento.
- **Segredos e dados:** segredos somente em variáveis/gerenciador local; `.env` ignorado; credenciais nunca nos exemplos, imagens de screenshot, CI, issues ou logs; fixtures sintéticas; armazenamento local criptografável e backup restic criptografado.
- **Governança:** PRs com revisão e testes, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `GOVERNANCE.md`, políticas de dependências e aviso de marca registrada separado da licença de código.
- **Monetização:** dashboard estima/observa ganhos **somente nos canais da instalação**; software não promete ganhos, não faz venda/afiliados, não compra audiência e não disponibiliza receita alheia. Receita de anúncios continua bloqueada em R$0 enquanto contas não forem elegíveis.
- **Publicação e compliance:** plataformas que não permitem autoposting para a aplicação pessoal terão exportação e checklist manual; nenhuma automação não oficial de sessão/cookie/conta falsa.

### Definição de pronto para publicar o repositório

1. `LICENSE` íntegra, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `GOVERNANCE.md`, `THIRD_PARTY_NOTICES.md` e `docs/OPEN_SOURCE_ARCHITECTURE.md` existentes.
2. Reprodutibilidade: `config.example.toml` + `.env.example` sem credenciais, instrução de build Windows/Linux e dependências travadas.
3. Ferramentas em CI rodando format/lint/test/security e testes de contratos com fakes; sem cobrança ou acesso a redes reais no CI.
4. Varredura do histórico Git **antes** de publicar: tokens, CPF, dados bancários, IP residencial, endpoints privados, vídeos sem licença, metadados GPS e outputs privados. Se segredo já foi commitado, revogá-lo/rotacioná-lo; apagar arquivo da ponta não é suficiente.
5. Repositório aberto não significa release funcional: tags só após testes e pacote verificável. `README` declara claramente o estágio do projeto.
6. Binários de terceiros e modelos têm inventário SPDX com licença e origem verificadas; não empacotar pesos nem mídias desconhecidas.
7. `docs/PRIVACY.md` explica execução local, retenção de dados, backup, exportação, exclusão e ausência de coleta central.

### Compatibilidade de licenças e plugins

Usar o princípio **"verificar a licença por componente e por artefato distribuído"**, não assumir compatibilidade por chamar tudo de open-source. A licença do projeto não altera as licenças dos modelos e dados. Adotamos Apache-2.0 para código próprio neste pacote; qualquer inclusão de dependência/copyleft ou asset restrito exige revisão documentada. Uma dependência com código aberto não garante checkpoint ou uso comercial livre.


## 0. Premissas verificadas versus premissas pendentes

| Item | Situação | Tratamento financeiro |
|---|---|---|
| Energia elétrica já inclusa no aluguel | Informado pelo proprietário | **R$ 0 adicionais** no fluxo de caixa; energia física existe, mas não aumenta a conta sob contrato sem franquia |
| VPS já contratado | Informado pelo proprietário | **R$ 0 adicionais**, condicionado à CPU/RAM/disco/tráfego livres; proibir expansão automática |
| IA já paga | Informado pelo proprietário | **R$ 0 adicionais somente se a assinatura/entitlement atual permitir automação/API dentro de cotas pagas OU se usar modelo local.** Assinatura de ChatGPT/Claude não é, por si, crédito de API |
| Desktop com Radeon RX 6600 / Windows 11 | Informação anterior sujeita a conferência | Não comprar equipamento até executar inventário; inferência CUDA não se aplica a AMD |
| Backup fora do computador | Custo novo aceito | Cotar Cloudflare R2 ou Backblaze B2; cobrança de uso real + tributos, câmbio e arredondamentos |
| CPU, RAM, SSD, upload, franquia do VPS | **Não verificados** | Impedem orçamento definitivo de hardware e taxa de produção |
| Contas e participação em programas de monetização | **Não verificadas** | Receita R$0 até habilitação efetiva; cada plataforma tem requisitos específicos |
| Volume inicial | Proposta mensurável | 1 canal YouTube principal, 3 séries; piloto 4 longos + 12 curtos/mês, escalar para 8+24 mediante aprovação |

### Não assumir
- Que já existe receita, Adsense aprovado ou condições de monetização atendidas.
- Que a assinatura da IA já paga inclui chamadas programáticas de API. Tratar `incremental_ai_cost` como UNKNOWN até verificar.
- Que a RX 6600 executa localmente qualquer TTS generativo ou modelo de vídeo com bom desempenho.
- Que um canal faceless recebe automaticamente monetização.
- Que mesmo sem gasto extra há lucro econômico: suas horas, desgaste de equipamento e impostos devem aparecer na demonstração completa.

## 1. Carta de estratégia BA / PA / CEO

**BA (analista de negócios)**: provar demanda e elegibilidade de receita. Evidências: fontes de tendências confiáveis, audiência real, horas elegíveis, RPM real quando disponível, custos e riscos de direitos autorais. Sem promessas de views.

**PA (analista de produto)**: definir backlog de conteúdo e produção com qualidade, rastreabilidade, observabilidade e experimentos controlados. O produto não é uma fábrica de templates: é um **estúdio editorial programável** que produz conteúdo substancialmente original.

**CEO**: limitar caixa incremental ao backup e expansão explicitamente aprovada. Não comprar hardware, modelos nem APIs adicionais sem benchmark de gargalo. Em 90 dias, decisão GO/PIVOT/STOP com dados.

**Objetivos mensuráveis iniciais:**
1. Gerar 1 vídeo longo original (7–12 min) e 1 vídeo curto original (65–90 s) de ponta a ponta com qualidade aprovada.
2. Demonstrar no log custo marginal, minutos de edição humana, tempo de renderização, bytes produzidos, bytes de backup e restauração.
3. Publicar apenas após aprovação editorial inicial e autorização real da plataforma.
4. Iniciar 1 canal YouTube com 3 séries relacionadas; não fragmentar imediatamente horas/inscritos em 3 canais.
5. Implementar modo automático de pesquisa, produção e análise; ativar publicação sem revisão só se as regras e os controles de qualidade de fato sustentarem o risco. Tendências factuais/sensíveis exigem revisão.

## 2. Monetização: plataforma por plataforma (fonte primária)

### YouTube — prioridade 1
**Em 27/10/2026:** entrada na monetização principal de anúncios exige 1.000 inscritos + (4.000 horas públicas qualificadas em vídeos longos/12 meses **ou** 10 milhões de visualizações qualificadas em Shorts/90 dias), além de requisitos de conta e revisão do canal. Horas de Shorts no feed não contam nas 4.000 horas. Há um patamar de 500 inscritos para outros recursos, **não** equivalente a anúncios.

**Mudança já anunciada:** para novos criadores a partir de **01/02/2027**, limite de entrada para anúncios/Premium passa a **1.000 inscritos + 8.000 horas qualificadas/365 dias ou 20 milhões de views qualificadas em Shorts/90 dias**. A mudança anunciada não afeta quem já está no YPP. Monitorar atualização do YouTube Studio e termos oficiais; documentar critério vigente no momento da inscrição.

Referências:
- https://support.google.com/youtube/answer/72851?hl=pt-BR
- https://support.google.com/youtube/answer/94522?hl=pt-BR
- https://blog.youtube/intl/pt-br/news-and-events/novas-oportunidades-e-mudancas-programa-de-parcerias-do-youtube/
- https://blog.youtube/news-and-events/youtube-monetization-qualified-watch-hours-shorts-views/

**Orientação editorial:** Shorts geram descoberta e testam ganchos. Longos desenvolvem horas de visualização e receita de anúncios quando elegíveis. Nunca alongar superficialmente vídeos para inserir publicidade.

### TikTok — prioridade 2, opcional
**Creator Rewards:** idade elegível, conta pessoal no mercado admitido, 10 mil seguidores, 100 mil views recentes e vídeos originais com duração maior que 1 minuto, entre outras regras e métricas de visualizações qualificadas. Verificar elegibilidade dentro do app. Shorts de 45 s não são elegíveis nesse programa.

**Publicação via API:** a documentação de Direct Post diz que apps não auditados ficam restritos a conteúdo privado e que utilitários para postar somente nas próprias contas/equipe não são uso aceitável. Portanto **não planejar publicação pública automática pelo Direct Post API no produto próprio**. Gerar MP4/legendas/manifesto para publicação manual na conta; não usar bots de navegador para contornar termos.

Referências:
- https://support.tiktok.com/pt_BR/business-and-creator/creator-rewards-program/how-is-the-creator-rewards-program-different-from-the-tiktok-creator-fund
- https://developers.tiktok.com/docs/en/content-sharing-guidelines
- https://developers.tiktok.com/docs/en/content-posting-api-get-started

### Facebook — prioridade 3, oportunidade condicionada
Content Monetization depende de elegibilidade e convites/disponibilização por conta/região; nunca contar receita no orçamento sem acesso real. Publicação só pelo fluxo autorizado. Instagram = distribuição e testes, **receita zero presumida**.

### Carteira de receita permitida
1. Anúncios em vídeos longos do YouTube.
2. Parcela do YouTube Premium atribuída.
3. Participação no pool de anúncios de Shorts elegíveis.
4. Creator Rewards do TikTok **se** aprovado e compatível com vídeos específicos.
5. Content Monetization do Facebook **se** aprovado.

Não somar visualizações da mesma pessoa nas três redes como se todas fossem monetizáveis; cada plataforma mede views *qualificadas* e pagamentos próprios.

## 2.1. Cadastro e recebimento como pessoa física, sem CNPJ

O projeto admite **conta individual** onde o programa permitir. Isso não garante dispensa de obrigações fiscais. O software não cria uma empresa nem emite nota fiscal.

**Passo a passo operacional do YouTube:**
1. Criar ou selecionar uma conta Google cujo controle pertence ao operador e ativar verificação em duas etapas; documentar recuperação da conta.
2. Criar/definir um canal com descrição e identidade original. Habilitar recursos avançados quando a plataforma pedir.
3. No YouTube Studio > Ganhos, verificar os requisitos e acompanhar **inscritos, horas públicas qualificadas e views qualificadas de Shorts**. Não criar conta AdSense duplicada fora do fluxo recomendado do Studio.
4. Quando o canal estiver elegível, solicitar o Programa de Parcerias e concluir revisão de conteúdo. Até a aceitação, `monetization_enabled=false` e `ad_revenue=0` no sistema.
5. Configurar **AdSense para YouTube** como perfil de pagamentos individual, seguindo opções efetivamente oferecidas. Nome, documento, endereço e país devem corresponder às informações reais. Não colocar CPF, endereço ou banco no código ou nos logs.
6. Quando solicitado, validar identidade e endereço (PIN quando aplicável), fornecer informações fiscais exigidas pelo Google (inclusive dos EUA), cadastrar conta bancária e acompanhar o limite mínimo de pagamento específico da moeda/conta. Se houver retenção fiscal, registrar valores oficiais, não taxa inventada.
7. Distinguir `estimated_revenue`, `finalized_balance`, `paid_amount` e `payout_date`. Receita acumulada no Studio não é dinheiro depositado; pagamentos seguem calendário e limite mínimo.
8. Consultar contador se houver dúvidas sobre tributação brasileira de rendimentos como pessoa física; não presumir imposto zero.

Referências oficiais:
- https://support.google.com/youtube/answer/14732067?hl=pt-BR
- https://support.google.com/youtube/answer/11602441?hl=pt-BR
- https://support.google.com/youtube/answer/7568896?co=GENIE.CountryCode%3DBR&hl=pt-BR
- https://support.google.com/youtube/answer/10391362?hl=en
- https://support.google.com/adsense/answer/1709871?hl=en

**Critério de aceite da fase de monetização:** status do Studio conhecido, tipo de perfil de pagamento conferido, exigências legais pendentes explicitadas, sem coleta indevida de dados privados pelo aplicativo.

## 3. Inventário e pré-requisitos antes de qualquer compra

### Informações que o Codex precisa coletar automaticamente (com consentimento)
- Windows Edition/build; CPU modelo/núcleos; RAM física e livre; modelo de GPU/VRAM; drivers AMD; disponibilidade de AMF; armazenamento livre, SSD/HDD, SMART se acessível; internet upload estável (medida opt-in); versões Rust, cargo, ffmpeg, ffprobe, Blender, Python e Node; formatos de encoder, modelos que rodam no dispositivo.
- VPS: CPU, RAM, disco, tráfego/franquia, backup e utilização atuais; PostgreSQL já ativo? portas e políticas de acesso; TLS; DNS; Docker/Podman.
- Assinatura de IA: fornecedor, produto, existência ou não de API programática, limite contratado, disponibilidade de chamadas incluídas; **não solicitar credenciais sensíveis em chat**.
- Canais: habilitação 2FA, recursos avançados YouTube, AdSense, CPF/dados fiscais quando exigidos pela plataforma, Analytics API, consentimento OAuth, disponibilidade de TikTok Rewards/Facebook Monetization.

### Comandos de inspeção (Windows PowerShell 7, leitura somente)
```powershell
Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors
Get-CimInstance Win32_PhysicalMemory | Measure-Object Capacity -Sum
Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,AdapterRAM
Get-Volume | Select-Object DriveLetter,FileSystemLabel,SizeRemaining,Size
ffmpeg -version
ffmpeg -encoders | Select-String 'libx264|h264_amf|hevc_amf'
ffmpeg -hwaccels
ffprobe -version
rustc --version
cargo --version
```
**Nota:** `AdapterRAM` do Windows pode ser impreciso; cruzar com Radeon Software. Encoder listado não garante que codifique corretamente: testar render e comparar integridade.

### Especificação de hardware por etapa (não é lista de compras imediata)
| Item | Para MVP | Ideal depois de benchmark | Gatilho de compra |
|---|---|---|---|
| CPU | 4C/8T executando x264 | 8C/16T ou superior | Dois longos semanais excedendo janela disponível |
| RAM | 16 GB | 32 GB | P95 RAM >85% e swap em jobs reais |
| GPU | Codificação CPU; RX6600 se AMF funcionar | GPU atual até prova contrária | TTS/render impossíveis no tempo disponível |
| SSD local | 100–200 GB livres | 500 GB–1 TB para cache | Ocupação >80% e retenção local obrigatória |
| Backup remoto | 10 GB free ou pay-as-you-go | Retenção de versões testada | Necessidade de guardar mais histórico |
| Smartphone/câmera/microfone | Não necessários | Não comprar | Apenas se escopo editorial mudar |
| UPS | Não obrigatório | Opcional após risco medido | Perdas repetidas em renders por energia |

Compra proibida no MVP sem relatório: nova GPU, servidor GPU, NAS, licença de editor, assinatura de TTS, domínio novo se já houver, assinatura de armazenamento não escalonável.

## 4. Stack técnica — funções, licenças e decisões

**Core / performance:** Rust estável, `tokio`, `axum`, `serde`, `sqlx` com PostgreSQL existente, CLI nativa de FFmpeg via subprocesso validado (evitar bindings inseguros sem necessidade), fila durável no próprio PostgreSQL no MVP (sem Redis extra). Rust cuida da orquestração, não substitui codecs C/C++ eficientes.

**Vídeo e áudio:** FFmpeg/ffprobe; `libx264` como baseline qualidade; `h264_amf` se passar testes na RX6600; `libass` para legenda; Blender headless para diagramas 3D quando necessário; SVG/Cairo/Skia/HTML-to-image apenas conforme benchmark; OpenTimelineIO apenas se demonstrar benefício (evitar dependência decorativa).

**TTS:** Piper CPU com voz PT-BR devidamente licenciada e origem rastreável como baseline; Chatterbox PT-BR como opção experimental, somente após verificar licença do checkpoint, VRAM/CPU, qualidade e tempo de geração. Voz clonada exige direitos/consentimento; preferir voz sintética licenciada.

**Transcrição/verificação:** whisper.cpp no CPU e avaliar Vulkan sob hardware AMD, sem supor ROCm disponível. Texto do roteiro também alimenta alinhador de frases/palavras, com validação por ASR.

**Pesquisa:** RSS de fontes que permitem consulta, exportação RSS/CSV do Google Trends Brasil, YouTube Data API `mostPopular` e busca autorizada respeitando quotas. Repositório local de matérias e identificadores; não fazer scraping de fontes que proíbem.

**Painel:** UI mínima responsiva que consome API Rust; escolher front existente se houver; se zero, React/Vite pequeno para edição de pautas, aprovação e métricas. Sem investir semanas em dashboard ornamental.

**Observabilidade:** tracing Rust JSON, métricas de jobs, logs sem secrets, backup status, audit trail, relatórios JSON/CSV; open-source Grafana opcional **somente** se já instalado.

**Licenças:** executar `ffmpeg -L`; distribuir binários respeitando LGPL/GPL conforme build (com libx264 há implicações GPL). Verificar permissões para uso de imagens, áudio, fontes e checkpoints de IA separadamente. Nunca tratar “open source” como permissão universal sobre todos os modelos/vozes/mídias.

Links de referência:
- https://www.rust-lang.org/
- https://ffmpeg.org/
- https://www.ffmpeg.org/general.html
- https://www.blender.org/
- https://github.com/rhasspy/piper
- https://github.com/rhasspy/piper/blob/master/VOICES.md
- https://github.com/resemble-ai/chatterbox
- https://huggingface.co/ResembleAI/Chatterbox-Multilingual-pt-br
- https://github.com/ggml-org/whisper.cpp
- https://github.com/restic/restic

## 5. Arquitetura de execução local + VPS já pago

```
[Fontes públicas permitidas] --(poll)--> [VPS: Rust API/scheduler + Postgres]
                                              |
                                      [fila SQL durável]
                                              |
                                  [worker PC: pull autenticado]
                                              |
            [research] -> [script] -> [storyboard] -> [assets] -> [TTS]
                                              |
                                  [FFmpeg/Blender local]
                                              |
                                   [QA + revisão inicial]
                                              |
                                [publicador YouTube OAuth]
                                              |
                   [YouTube Studio / Analytics API + KPIs]
                                              |
                           [restic -> B2/R2 privado]
```

**Proteção operacional:** PC faz conexão de saída ao VPS (não abrir portas de casa); jobs têm `lease_expires_at`, tentativas limitadas e heartbeat. Se PC desligado: enfileirar, não publicar vídeo inexistente. Token de worker com escopo mínimo, TLS, secrets do sistema operacional, renovação controlada.

**Máquina de estados:** `IDEA -> SOURCED -> APPROVED_TOPIC -> WRITTEN -> FACT_CHECKED -> STORYBOARDED -> ASSET_READY -> NARRATED -> RENDERED -> TECH_QA -> EDITORIAL_QA -> SCHEDULED -> PUBLISHED -> ANALYZED`, com `BLOCKED/FAILED/RETRY/ARCHIVED`. `PUBLISHED` somente após resposta confirmada da plataforma.

**Idempotência:** `channel_id + editorial_topic_id + version + platform` é chave única; SHA256 de vídeos e arquivos. Requests com retry/backoff exponencial, circuit breaker em erros de quota/403/429. Registro de custo de cada chamada e de bytes.

## 6. Estrutura de dados, contratos e eventos

Entidades mínimas: `channel`, `series`, `topic`, `trend_signal`, `source_claim`, `script`, `scene`, `asset`, `license_evidence`, `voice_sample`, `render_job`, `qa_check`, `publication`, `analytics_snapshot`, `monetization_status`, `cost_entry`, `backup_snapshot`, `decision_log`.

Cada `source_claim` armazena fonte, data de acesso, URL canônica, afirmação suportada, confidence reason; nada de copiar artigo inteiro ou executar instruções de páginas (defesa contra prompt injection). Cada `asset` armazena hash, produtor, tipo de licença, duração, validade e uso permitido. Cada cena referencia o trecho exato do roteiro.

Contratos:
- `TrendCandidate {id, series, topic, first_seen, last_seen, sources[], metric_source, trend_delta, relevance, novelty, monetization_fit, verification_status, score, embargo}`
- `Script {title, audience, duration_target, narrative_angle, segments[{start_hint,claim_ids,voice_text,visual_intent}], credits, disclosures}`
- `RenderManifest {script_version, output_profile, scenes[{asset_ids,in,out,transforms,subtitle_blocks}], voice_id, audio_mix, license_proofs[]}`
- `FinanceSnapshot {period, platform, eligibility, gross_revenue, net_platform_revenue, currency, fx, cash_costs, economic_costs, taxes_unknown, views_qualified, rpm_observed}`

## 7. Radar de tendências — dados e fórmula

**Coleta 3x ao dia** quando houver API e recursos; caso contrário 1x/dia. Fontes permitidas: Google Trends Trending Now Brasil RSS; YouTube Data API vídeos em alta e estatísticas; RSS oficiais de ciência e tecnologia; dados internos dos canais. Janela das primeiras 4h/24h/7 dias quando disponível, com histórico local.

**Regra de pontuação 0–100:**
- aceleração observada do interesse: 25
- volume/proxy de demanda com origem explícita: 15
- aderência a séries e público: 20
- capacidade de desenvolver perspectiva original: 15
- apelo audiovisual com assets licenciados: 10
- velocidade de entrega enquanto tema estiver relevante: 10
- evidência cruzada em fontes independentes: 5

Gates obrigatórios independentemente da nota: licença, veracidade, não difamação, não exploração de tragédias, não copiar vídeos de terceiros, potencial valor original, risco de copyright de esportes.

**Alocação-alvo de pauta:** 50% tendências, 30% evergreen relevante e 20% temas em ascensão; revisar após 28 dias conforme retenção e watch time. Não publicar notícia desatualizada. Cada tópico deve ter um ângulo explicado em 1 sentença que NÃO seja “o mesmo vídeo popular refeito”.

## 8. Produção editorial original — especificação

### Série A: IA e futuro digital
- Entradas: releases oficiais, changelogs, documentação, demonstrações autorizadas.
- Visual: gravação própria de software (OBS ou Playwright com ambiente de demonstração autorizado), dashboards originais, gráficos explicativos, animação de UI criada internamente.
- Ângulos: “o que mudou?”, “quem é impactado?”, “teste reprodutível”, “limitação real”. Não afirmar funcionalidade sem testar.

### Série B: tecnologia e engenharia
- Entradas: ficha técnica oficial e testes de terceiros devidamente atribuídos; demonstração própria se possível.
- Visual: desenhos vetoriais do produto, diagramas, componentes modelados, tabelas e gráficos próprios. Fotografias apenas com licença ou permissão.
- Ângulos: tradeoffs técnicos, testes documentados, o que especificações significam. Nunca dizer “testei” se não testou.

### Série C: ciência e fenômenos
- Entradas: instituições científicas, periódicos e fontes primárias.
- Visual: Blender 3D, infográficos originais, dados citados; sem falsas reconstruções documentais apresentadas como reais.
- Ângulos: por que importa, explicação causal, evidência e limites da descoberta.

### Formatos e cadência
- Longo: 7–12 min conforme assunto; 1/semana no piloto, 2/semana na expansão.
- Curto: 65–90 segundos para permitir teste de elegibilidade de vídeos TikTok >1 min; 3/semana no piloto, 6/semana na expansão. Curtos para TikTok só se compatíveis com limites atuais e critérios reais da plataforma.
- Gerar versões editoriais distintas adequadas a cada plataforma; não repostar conteúdo de terceiros nem duplicar vídeos quase idênticos sem nova contribuição.
- Meta expansão: 8 longos + 24 curtos/4 semanas = 32 produções originais, que podem ter múltiplas distribuições, mas nunca contar republicações como originais adicionais.

### Exemplo de storyboard curto 75s (A)
0–4s: problema visual específico mostrado com demonstração original; sem logo longo.
4–15s: prova visual do tema/novidade e data.
15–32s: demonstração passo a passo com zoom e cursor.
32–50s: comparação e limitação verificadas.
50–67s: implicação prática com dados/ilustração.
67–75s: síntese e convite legítimo para acompanhar a série (sem venda).

### Exemplo de vídeo longo 9min
0:00–0:20 pergunta e promessa honesta; 0:20–1:00 contexto; 1:00–3:30 primeira demonstração/evidência; 3:30–6:15 aprofundamento; 6:15–8:15 contraprova/limitações; 8:15–9:00 síntese e próximo tópico. Tempos adaptáveis à história; não cortar fala para respeitar template.

### Requisitos criativos
- Voz pt-BR com dicção humana; nenhum erro técnico evidente, pronúncia de nomes/termos testada, pausas adequadas.
- Legendas sincronizadas em 1–2 linhas, área segura específica por plataforma; fontes licenciadas, contraste legível.
- Ritmo audiovisual sustentado por informação e intenção; alternância de planos não cronometrada mecanicamente.
- Mixagem com pico seguro, sem clipping; sem trilha protegida. Conteúdo histórico/científico marcado como reconstrução quando necessário.

## 9. QA técnico, editorial e monetização

**Técnico automático (bloqueante):** `ffprobe` valida codec/duração/resolução/fps/áudio; decodificar vídeo completo; `blackdetect`, `freezedetect`, `silencedetect`, `loudnorm`/`ebur128` quando aplicável; checar sobreposição de legendas, safe area e duração de cena; conferir hash e metadata, sincronismo e ortografia; verificar backup do projeto e manifest.

**Editorial (bloqueante):** afirmações com fonte; originalidade substancial; roteiro sem copy/paste; metadados honestos; cenas sem direitos inseguros; dados sensíveis respeitados; transparência sobre mídia sintética quando exigida. IA não aprova sozinha temas ambíguos e notícias sensíveis.

**Monetização (bloqueante):** conteúdo “mass-produced / repetitive / inauthentic” ou reutilização de outros sem contribuição substancial não é elegível. A mesma vinheta pode se repetir, o conteúdo principal não. Registrar plano de diferenciação por vídeo.

Fonte oficial: https://support.google.com/youtube/answer/1311392

**Aceite por piloto:** score humano de 1–5 em voz, fluidez, informação, originalidade, efeitos, consistência; mínimo 4/5 em cada; 0 falhas técnicas críticas; 100% claims centrais rastreáveis. Após 3 vídeos aprovados, automatizar verificações, mas manter revisão por amostragem.

## 10. Backup — única nova despesa prevista

### O que guardar e o que descartar
Guardar: dump cifrado do PostgreSQL, manifestos, roteiros e versões, evidências de licença, arquivos finais de publicação, miniaturas, TTS final, fonte de projeto, configurações e código-fonte versionado. Pode descartar após aceitação: cache de render, frames intermediários e downloads temporários reconstituíveis.

**RPO-alvo** até 24 horas para dados; **RTO-alvo** até 24 horas após disponibilizar PC/credenciais; medir via restore. Política inicial: snapshots diários de banco/manifestos, semanal full logical consistency, restic incremental/deduplicação, guardar 7 diários + 4 semanais + 3 mensais para dados essenciais; fonte/final por 90 dias, retenção posterior condicionada a espaço. Cifrar com restic e proteger senha separadamente; sem senha de recuperação, backup não é recuperável.

### Provedores e custos pesquisados em 27/10/2026
- **Backblaze B2**: primeiros 10 GB grátis e tarifa a partir de **US$ 6,95/TB-mês**, sem tarifas de API para pay-as-you-go conforme página oficial. Pode ter custo de download acima do egress incluso. https://www.backblaze.com/cloud-storage/pricing
- **Cloudflare R2 Standard**: primeiros 10 GB-mês grátis; **US$ 0,015/GB-mês** acima, operações grátis até faixas, egress grátis. https://developers.cloudflare.com/r2/pricing/
- Ferramenta local de backup: `restic`, snapshots criptografados, deduplicados; suporte a B2 via S3 API. https://www.backblaze.com/docs/cloud-storage-integrate-restic-with-backblaze-b2

**Cotações hipotéticas a R$5,34/US$ e cobranças por GB médio mensal**, excluindo IOF, spreads, impostos e arredondamentos:
| Armazenamento médio | B2 (~US$6,95/TB) | R2 standard |
|---|---:|---:|
| 10 GB | R$0 | R$0 |
| 50 GB | R$1,48 | R$3,20 |
| 150 GB | R$5,20 | R$11,21 |
| 500 GB | R$18,18 | R$39,25 |

*Nota:* TB no B2 é modelado aqui como 1.000 GB; verificar unidade e faturamento na conta. Custo final de câmbio/cartão/tributos pode superar valores. Não confiar em preço antecipado sem testar billing real.

### Projeção de espaço — 4 semanas
- 8 vídeos longos × 10 min × bitrate final médio 8 Mbps ≈ 4,8 GB.
- 24 curtos × 75s × 8 Mbps ≈ 1,8 GB.
- Voz, projeto, gráficos, banco, thumb, áudios ≈ 2–15 GB variáveis.
- Total novo **~9–22 GB/mês**, antes de versões extra, mídia bruta, deduplicação e manutenção. Backup “com assets fonte” pode ser muito maior: medir bytes reais.
- Em 90 dias sem expurgo: ~27–66 GB pela premissa acima. Cenário de 150–500 GB protege contra acúmulo real maior.

**Procedimento de restauração:** uma vez a cada 30 dias restaurar amostras de dump e 1 projeto completo para pasta temporária, comparar SHA256, abrir vídeo, reconstruir projeto. Reportar duração e faltas. Alertar se último snapshot >24h, falha de backup ou custo previsto >teto.

## 11. Finanças — fluxo de caixa correto

### Custo incremental de caixa
`Backup remoto faturado + custos NOVOS aprovados`. Energia = 0 adicional; VPS = 0 adicional se plano e capacidade bastarem; IA = 0 **somente** se já paga e com acesso programático/cotas suficientes OU execução local. Equipamentos já possuídos = R$0 de compra inicial. Custos novos inesperados implicam aprovação; monitor de limites aborta excedentes.

### Custo econômico para decisão de negócio
`Caixa incremental + rateio de gastos existentes atribuíveis (opcional) + depreciação técnica estimada + horas próprias × valor-hora + tributos/taxas`. Exibir separadamente. Não classificar lucro econômico como positivo se horas próprias não foram valorizadas.

### Receitas
`Receita efetivamente creditada por plataforma` (preferível) ou `views qualificadas / 1000 × RPM observado` para estimativa. Não usar views totais ou impressions como receita. Para plataforma sem monetização aprovada: **receita zero**. Não usar RPM de Shorts para vídeos longos. TikTok/Facebook apenas valores oficiais observados depois da elegibilidade.

### Cenários **ilustrativos**, 1 canal YouTube aprovado, caixa extra só backup
Supor backup pago **R$10/mês** (não uma fatura) e **RPM longo** de R$3/R$6/R$10 por mil views monetizadas (faixas de sensibilidade **não** taxas asseguradas):

| Views qualificadas longas/mês | R$3 RPM | R$6 RPM | R$10 RPM |
|---:|---:|---:|---:|
| 0 (ou canal não habilitado) | -R$10 | -R$10 | -R$10 |
| 10.000 | +R$20 | +R$50 | +R$90 |
| 50.000 | +R$140 | +R$290 | +R$490 |
| 100.000 | +R$290 | +R$590 | +R$990 |
| 300.000 | +R$890 | +R$1.790 | +R$2.990 |

Antes de impostos, taxa de câmbio/pagamentos aplicáveis e valor de suas horas. Com backup R$10 e RPM R$6, breakeven operacional ~1.667 visualizações monetizadas/mês **depois** da aprovação; não é atalho para elegibilidade nem significa pagamento imediato.

### Pior caso mensurável
Se não monetizar em 90 dias, receita R$0. Custo adicional previsto no exemplo de R$10/mês = R$30 em 3 meses. Se backup ficar dentro do free-tier, caixa novo pode ser zero, mas há trabalho e recursos existentes sendo usados. Deve-se evitar escalar por volume antes de comprovar qualidade.

### Como calcular potencial de monetização por horas
`horas qualificadas ≈ views válidas de longos × duração média assistida (min) / 60`.
- Para atingir 4.000 horas (regra vigente 2026) a 4 min médios: ~60.000 views válidas em vídeos longos no período de 365 dias, **além de 1.000 inscritos e condições**.
- Para atingir 8.000 horas (novos criadores, fev/2027) a 4 min médios: ~120.000 views válidas em longos, **além de 1.000 inscritos e condições**.
- “Views” aqui é uma aproximação matemática da watchtime: YouTube Studio determina as horas públicas qualificadas oficiais, que podem diferir.

### Modelo de dados do orçamento
Cada custo carrega `status={já pago, adicional confirmado, adicional potencial, desconhecido}`, `recorrência`, `limite`, `comprovante`, `data de referência`, `unidade`, `projeção` e `real`. Dashboard exibe 3 números diferentes: custo marginal, custo econômico e receita creditada. Projeções separadas da realidade.

## 12. KPIs e decisões de produto

**Conteúdo:** CTR de impressões longas (quando aplicável), watch time real, retenção aos 30s, retenção média, porcentagem de conclusão, retorno de espectadores, inscritos por mil views qualificadas, tráfego de pesquisa versus recomendações, comentário significativo, horas públicas qualificadas acumuladas.

**Operação:** `% render completo`, falhas por 100 jobs, tempo P50/P95 de render por minuto publicado, tempo de revisão por vídeo, GB armazenados, minutos de TTS, taxa de vozes reprovadas, % claims com fonte, incidentes de direitos.

**Financeiro:** custo novo mensal (meta backup-only), projeção B2/R2, horas de trabalho, RPM observado (após aprovação), receita oficial estimada/paga, resultado operacional, resultado econômico.

**Decisões para tendências:** comparar 24h/7d de vídeos de idade semelhante; não tirar conclusão de um vídeo. Testar 2 hooks por assunto quando houver variantes substanciais, não publicar clones. Sem sinais de audiência qualificada após amostra suficiente, mudar pauta, não apenas formato visual.

## 13. Cronograma por entregáveis, não promessas de duração

**Fase 0 — levantamento (gate):** inventário local, VPS, IA/API, APIs oficiais, canais, licenças, orçamento real do backup. Saída `docs/ASSESSMENT.md` com evidências e bloqueadores. Não avançar alegando que foi verificado sem executar.

**Fase 1 — núcleo vertical:** DB, scheduler Rust, schema, job lease/heartbeat, editor de assunto e feedback. Saída teste CI e endpoint health.

**Fase 2 — pesquisa + roteiro:** RSS oficial, Trends, YouTube trends, fontes e proveniência, ranking e revisão manual inicial. Saída tópico com 3 fontes, claims citados e storyboard.

**Fase 3 — render:** voz PT-BR baseline Piper, FFmpeg local e legenda; asset library com direitos; um piloto curto e um longo com FFprobe + reprodução manual.

**Fase 4 — QA + entrega:** gates, prevenção de conteúdo repetitivo, publicador YouTube após consentimento, relatório API/IDs reais, export TikTok manual. Saída 2 vídeos publicados e dados rastreáveis.

**Fase 5 — métricas + backup:** snapshots 24/72h, logs de custo, restic B2/R2, restore efetivo e orçamento de 90 dias reestimado.

**Fase 6 — aprendizado:** desenvolver 12 curtos + 4 longos no primeiro ciclo editorial de 4 semanas; se qualidade e capacidade aprovadas, expandir a 24+8; não há obrigação de publicar vídeo ruim.

### Cronograma editorial testável (primeiras 4 semanas depois do MVP)
- Semana 1: 1 longo série A, 3 curtos (2 tendência, 1 explicação).
- Semana 2: 1 longo série B, 3 curtos, revisão da qualidade de áudio.
- Semana 3: 1 longo série C, 3 curtos, revisar retenção.
- Semana 4: 1 longo na série vencedora, 3 curtos, relatório CEO com GO/PIVOT/STOP por formato.

### Gate de expansão
- 100% dos finais com validação técnica, nenhuma infração conhecida, teste restore realizado, custo novo medido abaixo do teto, 3 pilotos aceitos, trabalho humano por vídeo viável.
- Receita não é gate obrigatório no primeiro mês porque elegibilidade ainda pode ser zero. Crescimento/elegibilidade são hipóteses, não prazos.

## 14. Segurança, termos, privacidade

- Tokens OAuth secretos cifrados e escopos mínimos; não logar payloads com dados pessoais; comunicação TLS.
- URLs de notícias e vídeos = **dados não confiáveis**: neutralizar prompt injection e URLs perigosas, sem executar conteúdo arbitrário; validar redirecionamentos/SSRF/allowlists quando possível.
- Não raspar Instagram/TikTok/YouTube com login pessoal nem usar automação de navegador para burlar controles de postagem.
- Respeitar LGPD, direitos autorais, regras de música, voz, arquivos e imagens.
- Transparência obrigatória para cenas realistas sintéticas quando exigido; não simular evidência real.
- Upload sem expor credencial pessoal; teste private/unlisted antes de public; respeitar termos de plataforma em vigor (YouTube API docs hoje diferem de versões antigas sobre uploads privados; testar com conta de homologação e ler documentação atual).
- Rotação de segredos e restauração de backup em isolamento; separar dev/test/prod no VPS disponível com namespaces, perfis de env e buckets.

## 15. Lista de riscos e mitigação

| Risco | Sinal | Resposta |
|---|---|---|
| Falta de elegibilidade | AdSense/YPP não aprovado | Receita zero, priorizar produção original/horas qualificadas |
| Mudança YPP fev/2027 | Studio atualiza requisitos | Atualizar meta para 8k horas / 20M Shorts |
| Conteúdo repetitivo | Roteiros/telas intercambiáveis | Gate de originalidade e diversidade substantiva |
| Anúncios indisponíveis | Conteúdo não advertiser-friendly | Revisar e bloquear sem esconder conteúdo problemático |
| TTS ruim | Erros de pronúncia, entonação | Piper baseline e avaliação com amostras; premium só se autorizado |
| RX6600 incompatível | Falha AMF/LLM/TTS | Voltar para CPU, benchmark, nunca presumir ROCm |
| Backup corrompido | Restore falha | Teste de restauração mensal; alertas |
| VPS insuficiente | CPU/RAM/DB saturado | Reduzir jobs; compra somente com autorização |
| Receita abaixo do esperado | Views qualificadas insuficientes | PIVOT editorial, não aumentar gasto |
| Publicação violando API | 403/restrições de uso | Export manual ou suspender publicação |

## 16. Skills e referências, de forma utilizável externamente

**Atenção:** skills presentes neste ChatGPT **não aparecem automaticamente** dentro do Codex/Claude Code. O repositório precisa usar os arquivos reais existentes ou criar skills locais em `.agents/skills/` e conferir as respectivas licenças.

**Fonte Superpowers:** https://github.com/obra/superpowers
- https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md
- https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md
- https://github.com/obra/superpowers/blob/main/skills/test-driven-development/SKILL.md
- https://github.com/obra/superpowers/blob/main/skills/systematic-debugging/SKILL.md
- https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md
- https://github.com/obra/superpowers/blob/main/skills/requesting-code-review/SKILL.md
- https://github.com/obra/superpowers/blob/main/skills/using-git-worktrees/SKILL.md

**Fonte Vercel Agent Skills:** https://github.com/vercel-labs/agent-skills
- https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md
- https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md

**Especificação Agent Skills:** https://agentskills.io/specification ; https://github.com/agentskills/agentskills

**Skills locais a criar com testes** (cada uma com SKILL.md, gatilho e saída verificável):
- `business-analyst`: hipótese de demanda, elegibilidade, custo atribuível, risco, ranking.
- `product-analyst`: fluxo ponta a ponta, métricas, backlog e critérios de aceite.
- `ceo-capital-allocation`: teto de gastos, GO/PIVOT/STOP e custo de oportunidade.
- `trend-intelligence`: ingestão de sinais e scoring reproducível.
- `editorial-fact-check`: claims, proveniência, defasagem, originalidade.
- `audiovisual-direction`: storyboard, cenas, trilha, ritmo, identidade por série.
- `ffmpeg-quality-gate`: ffprobe, decodificação, métricas de áudio/vídeo.
- `platform-compliance`: elegibilidade, publicação permitida, disclosures.
- `storage-disaster-recovery`: restic, retenção, testes restauráveis e custo.
- `monetization-finance`: views qualificadas, RPM, receita creditada, comparação caixa/econômico.

## 17. Critérios de aceite finais (prova, não promessa)

1. Relatório exato do equipamento existente, versões, encoders, recursos e limites (PASS/FAIL/UNKNOWN).
2. API e custos de IA confirmados (0 adicional demonstrado ou risco explicitamente bloqueado).
3. Vídeo curto 65–90s e longo 7–12 min, originais, reproduzíveis, ambos com manifesto, licenças e QA.
4. Entrega com código e teste Rust, render FFmpeg, TTS local funcional no hardware efetivo ou fallback operacional honesto.
5. Backups cifrados e pelo menos 1 restauração testada, custo previsto versus real.
6. Dashboard com distinção clara de views, horas qualificadas, eligibility, revenue accrued e actual payout.
7. Publicações confirmadas via plataforma; export manual no TikTok até integração permitida.
8. Pelo menos 1 ciclo real de pautas com medição 24/72h, sem inventar CTR, retenção ou renda.
9. README com execução local/VPS, env.example sem segredos, operação, rollback, recuperação e limitações.
10. Veredito final com arquivos alterados, testes executados e resultados de verdade, pendências e bloqueadores.

## 18. Fontes essenciais consultadas (27/10/2026)
- YouTube monetização e mudança anunciada: https://blog.youtube/intl/pt-br/news-and-events/novas-oportunidades-e-mudancas-programa-de-parcerias-do-youtube/
- YouTube YPP: https://support.google.com/youtube/answer/72851?hl=pt-BR
- YouTube originalidade: https://support.google.com/youtube/answer/1311392
- YouTube horas qualificadas: https://blog.youtube/news-and-events/youtube-monetization-qualified-watch-hours-shorts-views/
- YouTube uploads: https://developers.google.com/youtube/data/reference/rest/v3/videos/insert
- AdSense pagamentos individuais e impostos: https://support.google.com/youtube/answer/14732067?hl=pt-BR
- TikTok rewards: https://support.tiktok.com/pt_BR/business-and-creator/creator-rewards-program/how-is-the-creator-rewards-program-different-from-the-tiktok-creator-fund
- TikTok API own account limitations: https://developers.tiktok.com/docs/en/content-sharing-guidelines
- Google Trends RSS: https://support.google.com/trends/answer/3076011
- B2: https://www.backblaze.com/cloud-storage/pricing
- R2: https://developers.cloudflare.com/r2/pricing/
- Backup restic B2: https://www.backblaze.com/docs/cloud-storage-integrate-restic-with-backblaze-b2
- FFmpeg AMD AMF: https://www.ffmpeg.org/general.html
- Chatterbox pt-BR: https://github.com/resemble-ai/chatterbox
- Whisper.cpp: https://github.com/ggml-org/whisper.cpp
- Superpowers: https://github.com/obra/superpowers
- Agent Skills spec: https://agentskills.io/specification

---
**Regra executiva final:** Não transformar volume, tendências ou automação em fim. O valor está em **conteúdo original com retenção suficiente para atingir elegibilidade e gerar receita publicitária real**. Custo marginal previsto é backup, sujeito a capacidade e assinaturas já pagas. A receita antes da habilitação é sempre zero.


## 19. Release e comunidade (exclusivo da versão open-source)

**Roadmap por entregável:** `v0.1.0` prova local curta/longa com CLI e QA; `v0.2.0` radar de tendência, fontes/licenças e interface básica; `v0.3.0` backup/restore e analytics; `v0.4.0` exportação para redes e publicação oficial habilitada por configuração; `v1.0.0` somente quando instalação nova e testes de integração forem reproduzíveis. Não lançar tags antecipadamente.

**Política de compatibilidade:** versionamento semântico, migrações de banco com rollback documentado, schemas/manifestos versionados, contrato de adaptadores por trait Rust, fixture e suíte de conformidade por plugin, sem executar plugins de terceiros como código confiável indiscriminadamente.

**Métricas do negócio pessoal:** status de YPP/Creator Rewards, horas elegíveis, views qualificadas, receita *confirmada* e gastos extras — **não confundir métricas da comunidade GitHub (stars/forks/downloads) com monetização das plataformas**.

**Estratégia para contribuições:** aceitar correções de segurança, suporte a modelos locais, novas fontes oficiais de tendências e melhorias de renderização. Não aceitar recursos de spam, scraping abusivo, manipulação de métricas, invasão de sessão ou violação de copyright. Issues públicas não devem incluir dados privados.

**Critério de licença:** antes da publicação inicial, dono confirma se prefere adoção ampla (Apache-2.0, default da v4) ou reciprocidade obrigatória via rede (AGPL-3.0). A escolha altera o `LICENSE` e a documentação, não a propriedade das contas nem a monetização pessoal.
