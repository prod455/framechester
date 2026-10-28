# Marketing e operação editorial do Framechester no YouTube

**Data da auditoria e consulta:** 27/10/2026, America/Sao_Paulo.
**Escopo atualizado pelo operador:** operação individual, local, faceless, em português, com **múltiplos canais isolados**. O operador informa que já configurou um canal; esta auditoria não acessou nem verificou essa conta. As três séries relacionadas de tecnologia, IA e ciência são uma hipótese inicial para o piloto no canal existente, não uma restrição a um único canal. Receita exclusivamente da monetização oficial da audiência, conforme o contrato do projeto.
**Veredito:** o projeto tem uma base executável para produção experimental; ainda não há evidência de conteúdo comercialmente pronto, canal elegível, receita ou lucro. Esta auditoria examinou código e documentação e consultou fontes oficiais; não acessou contas, executou publicação ou contratou serviços.

## 1. Diagnóstico do projeto

O objetivo comercial é fazer o operador obter resultado com conteúdo original; o software é o instrumento de produção. A principal hipótese a validar é se uma pessoa consegue produzir explicações úteis e distintas, com custo e tempo sustentáveis, para uma audiência que retorna. Aumentar a quantidade de vídeos antes dessa validação amplia retrabalho e risco editorial.

### Evidência encontrada no repositório

| Superfície examinada | O que existe | Consequência operacional |
|---|---|---|
| `README.md`, `docs/00-inventario-e-viabilidade.md` | Pre-alpha offline, com demonstrações documentadas de curto e longo, TTS, FFmpeg e pacote de publicação | Demonstração técnica; não comprova demanda, monetização ou aprovação editorial. Os testes/benchmarks ali citados são históricos e não foram repetidos nesta auditoria. |
| `crates/framechester-adapters/src/fixtures.rs` | Tendências estáticas, `TemplateLlm`, `LocalEvidenceProvider`, assets `testsrc2` | Não existe pesquisa de mercado ao vivo nesse caminho; fundo sintético e roteiro de template são material de teste. |
| `LocalEvidenceProvider::verify` | Uma URL presente permite mudar `Unverified` para `Cited` | Citação não prova veracidade, independência da fonte, atualidade ou licença de reprodução. |
| `crates/framechester-core/src/editorial.rs` | Score ponderado, bloqueios básicos e deduplicação por título normalizado | Dois links não comprovam duas fontes independentes; título diferente não comprova originalidade audiovisual. |
| `crates/framechester-core/src/qa.rs` | Revisão editorial retorna `NeedsHuman`; metadados de asset são verificados | A revisão humana permanece necessária. Campo de licença preenchido não equivale a direito comercial conferido. |
| `crates/framechester-core/src/package.rs` | SRT, descrição, fontes, thumbnail e `containsSyntheticMedia=true` | Há material revisável; disclosure é marcado genericamente, sem decisão contextual por peça. |
| `crates/framechester-adapters/src/publish.rs` | `DryRunPublisher`; bloqueio de publicação real | Nenhum upload ou ID real deve ser anunciado como entregue. |
| `scripts/verificar_youtube.py` | OAuth e leitura de canal; não consulta aprovação YPP nem receita | Conexão funcionando não demonstra monetização habilitada. |
| `crates/framechester-adapters/src/metrics.rs` | `NullMetrics` e importação de arquivo JSON | Ainda não há coleta real de desempenho neste caminho. |
| `MetricSample` em `crates/framechester-core/src/domain.rs` | `views`, `watch_hours`, `revenue_cents`, `monetized`, provedor e data | Modelo insuficiente para separar janela, formato, views intencionais, valores estimados/finalizados/pagos e moeda. |
| `crates/framechester-core/src/finance.rs` e `scripts/calculadora_monetizacao.py` | Simulação de custos e receitas | Cenário não é extrato do Studio nem dinheiro recebido; parâmetros precisam de origem e validade. |
| `THIRD_PARTY_NOTICES.md` | Licença-base do checkpoint da voz ainda pendente de confirmação | Resolver direitos da voz antes de tratá-la como aprovada para uma operação comercial; não redistribuir pesos por presunção. |

**Observação de formato:** o inventário registra uma demonstração curta de 78,5 s em 1920×1080. Isso prova duração curta, mas não prova classificação como Short. O próprio YouTube informa que uploads de até três minutos com proporção quadrada ou vertical são considerados Shorts. A fatia de produto deve distinguir duração e proporção. [Ajuda oficial sobre testes A/B, FAQ de Shorts](https://support.google.com/youtube/answer/16391400?hl=pt-BR).

Os achados refletem o código observado no início desta auditoria. Refatorações concorrentes devem atualizar o estado das pendências antes de reaproveitar este documento como lista de defeitos ativos.

## 2. Condições verificadas de monetização

### Regras vigentes e mudança anunciada

Em 27/10/2026, a página oficial do YPP apresenta 1.000 inscritos e 4.000 horas públicas qualificadas em 12 meses, ou 1.000 inscritos e 10 milhões de visualizações qualificadas de Shorts em 90 dias. Horas do feed dos Shorts não entram nas 4.000 horas. Há requisitos de conta, políticas, AdSense e revisão; atingir contagens não concede aprovação automática. O estado real deve ser conferido na área Ganhos do canal. [Visão geral e qualificação do YPP](https://support.google.com/youtube/answer/72851?hl=pt-BR).

O anúncio oficial de 10/08/2026 prevê, a partir de 01/02/2027, para novos candidatos à partilha de anúncios/Premium, 8.000 horas qualificadas em 365 dias ou 20 milhões de visualizações qualificadas de Shorts em 90 dias. O anúncio preserva os criadores que já integram o YPP nessa alteração de entrada. Também anuncia um requisito próprio de 10 milhões de visualizações qualificadas de Shorts em 90 dias para a partilha de Shorts, retomada quando o canal voltar a ultrapassar o patamar. Essa condição precisa de estado separado da receita de vídeos longos. Os termos atualizados devem ser verificados no Studio. [Anúncio oficial das mudanças](https://blog.youtube/intl/pt-br/news-and-events/novas-oportunidades-e-mudancas-programa-de-parcerias-do-youtube/).

O YPP expandido está disponível no Brasil e prevê acesso antecipado a determinados recursos com 500 inscritos, três envios públicos válidos em 90 dias e 3.000 horas qualificadas em 12 meses ou três milhões de visualizações qualificadas de Shorts em 90 dias. Esse acesso não equivale à partilha principal de anúncios. Financiamento por fãs e Shopping não entram no modelo de receita deste projeto. [Programa expandido](https://support.google.com/youtube/answer/13429240?hl=pt-BR).

**Decisão de produto proposta:** política com `consulted_at`, `effective_from`, URL, versão, status por recurso e revisão humana; nunca um booleano eterno inferido apenas por inscritos/views. Dados de elegibilidade desconhecidos deixam receita projetada de anúncios/Premium em zero no cenário operacional. Não há afirmação de que o canal do operador está aprovado.

### Originalidade e conteúdo com IA

O YouTube avalia o canal, inclusive tema, vídeos e metadados. Conteúdo massificado, genérico ou repetitivo pode ser inelegível; reaproveitar material exige contribuição substancial. Permissão de uso e política de conteúdo reutilizado são verificações diferentes: autorização de copyright não assegura aceitação no YPP. A atualização de 15/07/2025 esclareceu a política de conteúdo inautêntico. Não existe autorização geral para uma fábrica de vídeos por ser faceless ou usar TTS. [Políticas de monetização de canais](https://support.google.com/youtube/answer/1311392?hl=en).

Conteúdo realista gerado ou alterado significativamente por IA exige declaração nas situações descritas pelo YouTube. Assistência de roteiro, título ou miniatura, isoladamente, aparece entre os exemplos que não exigem declaração. Declarar IA, por si só, não retira elegibilidade de monetização. A decisão deve considerar as imagens e áudios realmente usados. [Transparência sobre IA generativa](https://support.google.com/youtube/answer/14328491?hl=pt-BR).

**Controle editorial proposto:** cada episódio apresenta pergunta, demonstração/análise própria, fontes conferidas, limitações e conclusão específica. Comparar com o catálogo recente para detectar repetição de substância. Um escore de similaridade auxilia triagem; uma pessoa decide se existe contribuição original suficiente. Não há percentual automático que garanta aprovação do YouTube.

### Segurança da publicação

A referência atual de `videos.insert` informa que a privacidade pode assumir `public` quando omitida, e que uploads de projetos não verificados não estão restritos a privado. Isso difere do histórico oficial de julho de 2020. Usar a referência atual, registrar a divergência e validar o projeto real; não reutilizar a restrição antiga como barreira de segurança. Um futuro adaptador deve enviar `status.privacyStatus=private` explicitamente, além dos campos de público e IA aplicáveis. A referência acessada mostra uma quota de upload específica; conferir os limites efetivamente atribuídos no Console antes de planejar volume. [Referência atual](https://developers.google.com/youtube/data/reference/rest/v3/videos/insert?hl=en), [histórico de revisão](https://developers.google.com/youtube/v3/revision_history).

O `dry_run=true` continua como padrão do Framechester. Uma autorização de pesquisa, auditoria ou refatoração não autoriza upload, mudança de visibilidade, gasto nem aceitação de contrato em nome do operador.

## 3. Equipe de marketing e contratos de trabalho

Estes são papéis de agentes e procedimentos; não representam profissionais humanos contratados. O operador acumula decisão final de negócio e aprovação de publicação. Uma mesma pessoa/agente pode exercer mais de um papel, mas uma revisão deve confrontar a evidência da produção.

| Papel | Pergunta que resolve | Artefato obrigatório | Critério de aceite |
|---|---|---|---|
| Direção de marketing | Para quem existe o canal e qual promessa pode cumprir? | Carta de posicionamento e decisão de portfólio | Público, benefício, diferenciação e limites explícitos; sem promessa de renda. |
| Analista de marketing/pesquisa | Há uma pergunta real que merece esse episódio? | Brief com sinais datados, links e hipóteses alternativas | Separar observação de hipótese; não inventar volume de busca ou desempenho de concorrentes. |
| Gestão de marketing | O plano cabe no tempo e orçamento? | Calendário, responsáveis, capacidade e bloqueios | Trabalho em andamento limitado; qualidade aprovada antes de escalar frequência. |
| Analista de YouTube | Que público e formato respondem melhor? | Relatório por formato, série, fonte de tráfego e janela | Dados rastreáveis, denominadores compatíveis e recomendações com incerteza. |
| Direção editorial | A pauta é verdadeira, útil e própria? | Brief aprovado, mapa de evidências e crítica editorial | Claims sustentados; divergências e limites visíveis. |
| Roteirista | O argumento funciona falado? | Roteiro com locução, cena, duração estimada e fonte | Linguagem natural, sem leitura/copiação de artigo; nenhuma experiência fingida. |
| Storytelling | Existe progressão e entrega da promessa? | Estrutura de abertura, pergunta, evidências, virada e conclusão | Curiosidade resolvida; sem suspense artificial que adie a explicação. |
| Design de marketing | O pacote é legível e fiel ao conteúdo? | Variantes de thumbnail/título, guia visual e arquivos de origem | Leitura em celular, contraste e promessa compatível com o vídeo. |
| Direção audiovisual | Como tornar a explicação compreensível? | Storyboard, plano de assets e guia de som | Cada visual tem função; nenhuma imagem de teste fingida como fato. |
| Edição audiovisual | O material final está claro e íntegro? | MP4, legendas, thumbnail e relatório de revisão | Ritmo, voz, sincronismo, enquadramento e direitos revisados. |
| Análise de dados | O experimento respondeu à pergunta? | Dataset local, dicionário e registro de decisão | Sem confundir correlação/causalidade ou pequeno sinal com vencedor. |
| Compliance/jurídico de marketing | Quais direitos, regras e dúvidas bloqueiam a peça? | Matriz de direitos e triagem com fontes oficiais | Status aprovado/pendente/bloqueado por item; escalar questões específicas a profissional habilitado. |
| BA/PA/CEO e financeiro | O esforço está produzindo valor sustentável? | Resultado de caixa/econômico, hipóteses e GO/PIVOT/STOP | Custo humano e riscos considerados; receita somente com origem permitida. |

**Handoff por episódio:** pesquisa → direção editorial → roteiro/storytelling → storyboard/design → assets/narração/edição → QA técnico → revisão editorial/compliance → autorização do operador → publicação permitida → observação → decisão. Falhas retornam ao responsável pelo artefato; marketing não pode dispensar um bloqueio técnico, e um teste técnico aprovado não decide veracidade.

## 4. Estratégia de canal a testar

As propostas desta seção são hipóteses internas; não são demanda comprovada ou recomendações de investimento.

### Operação multicanais

A instrução mais recente do operador usa “multi-tenant” para significar **múltiplos canais**. Adotar um operador com canais isolados, sem acrescentar SaaS multiusuário, cobrança, SSO ou compartilhamento central. Cada canal precisa de `channel_id`, identidade editorial, audiência-alvo, séries, contexto de direitos, pasta de artefatos, vínculo de credencial, histórico de publicação, custos, experimentos e aprovação YPP por recurso. Dados e autorizações de um canal não habilitam outro.

O canal já configurado é o candidato natural ao piloto, após conferir localmente a identidade correta e a disponibilidade do operador. Evitar publicar a mesma peça em vários canais como estratégia automática. A decisão de abrir ou ativar outro canal depende de proposta editorial distinta e capacidade mensurada; as métricas não devem agregar inscritos/horas de canais diferentes para simular elegibilidade.

**Contrato de isolamento proposto:** um comando ou job seleciona o canal explicitamente ou usa o padrão local conferido; resolve credencial e workdir desse canal; grava `channel_id` em todo artefato/evento; rejeita importação que mistura canais sem mapeamento explícito. Um painel de portfólio pode somar custos e resultados compatíveis, preservando o detalhamento e a elegibilidade individual. Segredos permanecem fora de documentos públicos.

**Público inicial proposto:** adultos brasileiros curiosos sobre tecnologia, IA e ciência que querem compreender efeitos e limitações sem precisar acompanhar papers e especificações diariamente.

**Promessa editorial proposta:** explicar uma pergunta concreta com demonstrações reproduzíveis, diagramas próprios e fontes acessíveis. A identidade do canal vem do método e da clareza, sem exigir rosto do operador.

| Série proposta | Função | Episódio candidato, sujeito a pesquisa | Evidência original possível |
|---|---|---|---|
| IA por dentro | Explicar capacidades e limites | “Quanto de memória um modelo local realmente usa?” | Benchmark local com versão, arquivo, configuração e limites; somente após executar. |
| Engenharia visível | Mostrar decisões técnicas | “Quando a GPU deixa um vídeo pior?” | Comparação controlada de encoder com cenas autorizadas e parâmetros publicados. |
| Ciência sem atalhos | Ensinar leitura crítica | “O que um gráfico permite concluir?” | Gráficos próprios com dados sintéticos rotulados e comparação de interpretações. |

Começar com três briefs de longo e três de curto, escolher um de cada para prova editorial. Não gravar alegações de testes físicos ou benchmarks que não ocorreram. Os exemplos podem ser alterados depois da pesquisa de audiência.

### Estrutura de roteiro e storyboard

1. **Abertura:** uma pergunta reconhecível e uma promessa verificável; evitar resultado sensacionalista ainda não demonstrado.
2. **Contexto:** o mínimo necessário para entender a pergunta, com vocabulário explicado na primeira ocorrência.
3. **Demonstração:** evidências, comparação ou experimento próprio; marcar simulação e imagens ilustrativas.
4. **Limitação:** o que o método não mede, o que permanece incerto e qual outra explicação é possível.
5. **Entrega:** responder à pergunta e indicar uma próxima questão relacionada, sem pedido enganoso de engajamento.

Para cada cena, registrar: intenção, locução, fonte da afirmação, asset e direito, indicação de tela, tempo previsto, legenda e condição de disclosure. O vídeo curto precisa funcionar como explicação própria; cortar um trecho sem contexto não é critério suficiente.

### Design e distribuição

Criar um pequeno sistema visual com tipografia legível, cores estáveis, hierarquia de informação e diagramas próprios. A thumbnail apresenta uma tensão real do episódio; título e imagem se complementam. O YouTube recomenda precisão, concisão e avaliação das miniaturas por audiência e origem de tráfego. [Dicas oficiais de títulos e miniaturas](https://support.google.com/youtube/answer/12340300?hl=pt-BR).

O teste A/B nativo pode comparar até três opções de títulos/miniaturas e prioriza tempo de exibição. Depende de requisitos e disponibilidade do recurso, não está disponível para Shorts e pode ser inconclusivo. Não declarar que uma troca sequencial de thumbnail é experimento randomizado. [Teste A/B oficial](https://support.google.com/youtube/answer/16391400?hl=pt-BR).

Não comprar tráfego, views, comentários ou inscritos. Divulgação externa só em comunidades pertinentes e dentro de suas regras, sem spam e sem alegar que produz horas qualificadas ou retorno garantido. Instagram/TikTok/Facebook são expansão posterior, com revisão própria de formatos, direitos e API.

## 5. Experimentos e operação de 90 dias

Contar o ciclo operacional a partir do início de produção editorial validável; nenhuma meta aqui assegura entrada no YPP. Publicações dependem da autorização do operador e de conta válida.

| Etapa | Trabalho | Evidência para avançar |
|---|---|---|
| Preparação | Resolver direitos da voz/assets, formato vertical/quadrado do curto, mapa de claims, horas disponíveis e registro de custos | Um longo de 7–12 min e um curto de 65–90 s com QA e revisão humana, sem placeholders publicados. |
| Dias 1–30 | Piloto de até quatro longos e 12 curtos, limitado pela capacidade real | Pacotes aprovados, tempo/custo por episódio registrados e snapshots reais após publicação autorizada. |
| Dias 31–60 | Ajustar uma variável por hipótese: pergunta, estrutura de abertura ou embalagem | Registro anterior ao teste; comparar séries e formatos separadamente; resultado pode ser inconclusivo. |
| Dias 61–90 | Avaliar sustentabilidade e foco; priorizar a série com sinal repetível e custo viável | GO/PIVOT/STOP documentado com dados, capacidade, qualidade e riscos. |

**Exemplos de experimentos propostos:**

| ID | Hipótese | Variável | Medida e janela | Condição de decisão |
|---|---|---|---|---|
| E01 | Demonstrar primeiro ajuda a pessoa a entender o valor | Ordem da abertura em episódios comparáveis | Retenção inicial e duração média aos sete e 28 dias | Sinal direcional; diferenças de assunto/tráfego impedem afirmar causalidade. |
| E02 | Uma pergunta específica comunica melhor a promessa | Duas embalagens do mesmo longo, quando A/B nativo disponível | Resultado do teste nativo e coerência com o conteúdo | Adotar vencedora quando o Studio indicar; guardar “inconclusivo” como resultado válido. |
| E03 | Diagramas próprios reduzem tempo de montagem sem perda de clareza | Um estilo visual em duas pautas adequadas | Minutos humanos, falhas de revisão e observações de compreensão | Manter apenas se o ganho operacional não empobrecer substância ou repetir episódios. |
| E04 | Um curto autônomo apresenta um tema útil para o público do longo | Explicação curta ligada a longo pertinente | Engaged views, retenção e tráfego observado ao vídeo relacionado | Não converter correlação de datas em atribuição certa de inscritos ou receita. |

Amostra pequena não permite benchmark universal de CTR, retenção ou RPM. Antes de cada teste, fixar hipótese, mudança, janela, público/formato, guardrails e dados necessários; se o canal ainda não tiver base suficiente, classificar como aprendizado qualitativo. Não perseguir frequência de publicação sacrificando correções de fatos ou direitos.

**GO:** qualidade sustentada, tempo/custo dentro da capacidade e sinais coerentes de utilidade/retorno do público. **PIVOT:** reduzir temas ou mudar apresentação quando existe aprendizado, mas a promessa ainda não encontra audiência. **STOP/pausa de escala:** direitos ou qualidade irresolvidos, gasto sem cobertura autorizada ou carga de trabalho insustentável. Nenhum desses critérios declara lucratividade antes de medi-la.

## 6. Medição sem confundir audiência e receita

Desde 31/03/2025, a contagem pública de views de Shorts inclui início/replay; a medida de visualizações intencionais permanece disponível e fundamenta elegibilidade e partilha de receita de Shorts. Não usar views brutas como se fossem todas qualificadas. [Definição oficial de views dos Shorts](https://support.google.com/youtube/answer/10059070?hl=en).

A API Analytics documenta medidas de visualização, tempo assistido, duração média, inscritos e receita estimada. Essas medidas devem ser importadas com nome, unidade, filtros e período usados na consulta. Nem todo relatório suporta todas as combinações de dimensões/métricas. [Dicionário oficial de métricas](https://developers.google.com/youtube/analytics/metrics).

| Medida operacional proposta | Origem | Uso correto |
|---|---|---|
| Status YPP por recurso e data de validade | Studio/registro conferido pelo operador | Habilitar contabilidade de receita do recurso correspondente; desconhecido continua desconhecido. |
| Horas públicas qualificadas e Shorts qualificados | Área Ganhos/definição oficial vigente | Acompanhar candidatura; `watch_hours` genérico não substitui essa medida. |
| Impressões e CTR por superfície | Analytics/Studio | Diagnóstico da embalagem; manter denominador e fonte de tráfego. |
| Duração média, retenção inicial e pontos de abandono | Analytics/Studio | Detectar falhas na entrega, separados por formato, duração e janela. |
| Engaged views de Shorts | Analytics/Studio | Comparar Shorts com definição consistente; não somar diretamente a views de longos. |
| Retorno de espectadores e inscritos ganhos/perdidos | Analytics/Studio, quando disponível | Avaliar recorrência; não confundir inscrição atribuída ao vídeo com saldo do canal. |
| Tempo humano e tempo de máquina por episódio | Log local por etapa | Capacidade, gargalo e custo econômico; registrar retrabalho. |
| Receita estimada, saldo finalizado, valor pago e data | Analytics, AdSense e comprovante local | Três estados financeiros distintos; não antecipar depósito. |

O RPM representa receita por mil visualizações e é diferente de CPM. Ele pode incluir fontes que o contrato do projeto exclui; o analista deve separar a receita permitida, por formato e definição de view, e evitar descontar a participação do YouTube novamente quando já estiver embutida na medida. Não usar CPM como RPM. [Definições oficiais de RPM e CPM](https://support.google.com/youtube/answer/9314357?hl=pt-BR).

### Schema mínimo proposto para analytics

Guardar localmente: provedor, `channel_id`, vídeo, formato, série, janela inicial/final, timezone, moeda, definição da métrica, unidade, denominador, fonte/API ou importação manual, `captured_at`, status estimado/finalizado/pago e indicador de dado real/sintético. Valores indisponíveis são `null`/desconhecidos, nunca zero fabricado. Preferir agregados; não é necessário coletar nomes ou perfis dos espectadores para esse trabalho. Relatórios do portfólio mantêm filtro e origem por canal.

Separar as tabelas de publicação, snapshots de audiência, aprovação por recurso, receitas e pagamentos. Importação deve ter chave idempotente e registrar revisões do provedor; não somar repetidamente snapshots acumulados. Métricas de terceiros e fixtures nunca aparecem como receita da instalação.

## 7. Financeiro e critério de lucro

**Estado auditado:** não há prova de aprovação YPP, receita real ou pagamento. O cenário operacional reconhece R$0 de receita de anúncios/Premium até existir comprovação. Ausência de comprovante é estado desconhecido da conta, não verificação de saldo real zero.

Modelo analítico proposto, com receitas permitidas e sem dupla contagem:

```text
receita_cenario = receita_longo_permitida + receita_shorts_permitida
resultado_caixa = receita_reconhecida - tributos_aplicaveis - gastos_incrementais
resultado_economico = resultado_caixa - horas_proprias * valor_hora - rateios_e_depreciacao
```

Se uma receita estimada já combina anúncios e Premium, não somar Premium novamente. Receita acumulada, saldo finalizado e dinheiro recebido devem alimentar visões diferentes de competência/caixa. Tributos são parâmetros de cenário até haver tratamento fiscal conferido; percentual zero não é isenção afirmada.

Para um único formato, sem receita adicional, e com tributo proporcional `t`, o equilíbrio aproximado é `ceil(custo * 1000 / (RPM * (1-t)))`. Usar unidades monetárias consistentes. Uma implementação em centavos precisa demonstrar o menor volume que cobre custo após o próprio arredondamento; a fórmula contínua é explicação, não teste substituto. O caso `t=100%`, RPM zero, recurso inativo ou parâmetro desconhecido não produz um volume finito confiável.

### Pendências identificadas na implementação observada

- `finance.rs::simulate` calculava `breakeven_long_views` sem impostos, apesar de subtrair tributos do resultado de caixa. O teste com custo 248 centavos, RPM de 600 centavos e imposto de 10% esperava 414 views; a equação líquida contínua indicaria 460, sujeito ao arredondamento efetivo em centavos. Requer correção com teste de fronteira; conferir o código final antes de considerar ativo.
- `other_revenue_cents` não tinha fonte ou status e era adicionado independentemente de `eligible`. Não usá-lo como atalho para receita de anúncios nem para negócios excluídos. Um modelo futuro deve discriminar recurso, aprovação, origem e data.
- Preços de backup e câmbio nos defaults são parâmetros do software, não cotação verificada por esta auditoria. Antes de contratar, consultar o provedor e incluir operações, tráfego, tributos, spread e retenção efetivos. Não iniciar gasto remoto para fazer a estimativa.
- Energia incluída no aluguel e equipamento existente podem ter caixa incremental zero sob a premissa informada; tempo próprio, depreciação e rateios continuam relevantes. Chat pago não demonstra entitlement de API.

Registrar cenários pessimista/base/otimista apenas com parâmetros informados ou explicitamente hipotéticos; não preencher RPM, views ou crescimento com “média do mercado” sem evidência compatível. O resultado útil inicial é custo de produzir uma peça aprovada e capacidade semanal observada.

## 8. Jurídico e compliance de marketing

Esta seção define triagem e evidências operacionais. Decisões jurídicas/fiscais concretas dependem das circunstâncias e, quando necessário, de profissional habilitado.

### Direitos autorais e ativos

A Lei 9.610/1998 trata direitos exclusivos e autorizações de utilização; suas limitações incluem situações específicas de citação. Dar crédito não transforma qualquer obra em material livre para reprodução audiovisual. Examinar o uso concreto e os termos da licença; não importar uma regra genérica de “fair use” como autorização brasileira. [Texto atualizado, arts. 24, 28, 29 e 46](https://www2.camara.leg.br/legin/fed/lei/1998/lei-9610-19-fevereiro-1998-365399-normaatualizada-pl.html).

**Registro interno por asset:** origem, titular declarado, URL, data, arquivo/hash, licença/versão, uso comercial, adaptação/sincronização quando aplicável, atribuição exigida, restrições, pessoas/marcas e comprovante local. Fonte de pesquisa e asset reproduzido são coisas distintas. Não rotular artigo como CC BY por presunção; consultar um fato e copiar uma foto têm permissões diferentes.

Para música da Biblioteca de áudio do YouTube, conferir a faixa e a exigência de atribuição. A documentação permite monetização no YPP, mas distingue faixas Creative Commons e licença padrão; uma garantia da biblioteca no YouTube não deve ser estendida automaticamente a outras plataformas. [Biblioteca de áudio oficial](https://support.google.com/youtube/answer/3376882?hl=pt-BR).

### Publicidade, alegações e adequação aos anunciantes

Os arts. 36–38 do Código de Defesa do Consumidor exigem identificação da publicidade, vedam publicidade enganosa/abusiva e tratam da sustentação das alegações. O negócio atual exclui patrocínio negociado, afiliados e venda. Se o escopo mudar, revisar identificação e evidências antes de inserir comunicação comercial. Não apresentar publicidade como avaliação editorial independente. [CDC atualizado](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html).

Adequação a anunciantes alcança vídeo e metadados; conteúdo permitido na plataforma pode ter anúncios limitados. Revisar também título e thumbnail, especialmente violência, alegações nocivas ou não confiáveis, eventos sensíveis e temas controversos. [Diretrizes oficiais de publicidade](https://support.google.com/youtube/answer/6162278?hl=pt-BR).

### Dados pessoais

A LGPD alcança tratamentos de dados pessoais em condições definidas na lei e contém exceções específicas, inclusive para finalidades exclusivamente jornalísticas/artísticas. Operar sozinho/localmente não concede dispensa automática para qualquer analytics ou cadastro comercial. Quando aplicável, documentar finalidade, base legal, necessidade, retenção, segurança e direitos dos titulares. [LGPD atualizada, arts. 3, 4, 6, 7, 18 e 46](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html).

**Aplicação interna proposta:** manter métricas agregadas; não exportar comentários com identidade para LLM sem necessidade e análise; não coletar CPF/banco/documentos no repositório ou relatório público; armazenar OAuth em gerenciador local; excluir segredos dos logs. Política de privacidade e retenção acompanha a implementação real, conforme `docs/PRIVACY.md`.

### Checklist antes de autorizar publicação

- Pergunta e conclusão específicas; nenhuma experiência, medição ou aprovação inventada.
- Afirmações principais conferidas nas fontes, com data e limitações.
- Assets, música, voz, fontes e imagem de pessoas com direitos resolvidos para o uso.
- Aprovação técnica e revisão editorial humana registradas; ASR não substitui revisão de fatos.
- Título/thumbnail descrevem o episódio; vídeos comparados para evitar repetição de substância.
- Formato, público infantil, disclosure de IA e adequação aos anunciantes avaliados.
- Conta e método de publicação permitidos; autorização explícita do operador para o upload/visibilidade.
- Arquivo final e pacote identificados por hash; registro de versão aprovado, correção e eventual retirada.

## 9. Backlog priorizado para as duas equipes

| Prioridade | Entrega | Responsável principal | Critério verificável |
|---|---|---|---|
| P0 | Isolar a operação por `channel_id` | PA + engenharia + segurança | Conteúdo, custos, credenciais e métricas de A não aparecem em B; autorização/YPP de A não habilita B; teste negativo de cruzamento entre canais. |
| P0 | Separar fixtures de material de produção | Engenharia + direção editorial | Pacote de teste aparece como teste; placeholder não pode adquirir aprovação de produção silenciosamente. |
| P0 | Proveniência de claims e independência das fontes | BA/PA + editorial + QA | URL ausente, fonte inexistente e claim contraditório bloqueiam; `Cited` não vira `Verified` por presença de link. |
| P0 | Direitos da voz e assets comerciais | Compliance + audiovisual | Uso específico com licença/comprovante conferidos; pendência bloqueia publicação. |
| P0 | Aprovação rastreável do artefato final | Engenharia + QA + operador | Aprovação identifica hash, versão e revisão; mudar o arquivo invalida aprovação. |
| P1 | Render curto realmente compatível com Shorts | Audiovisual + engenharia + UX | Perfil vertical/quadrado explícito, legendas/thumbnail revisadas visualmente e testes de dimensão/duração. |
| P1 | Financeiro coerente e por recurso | BA + financeiro + engenharia | Impostos/arredondamento, recurso não elegível e 100% de imposto testados; cenários rotulados. |
| P1 | Primeiro longo e curto editoriais | Direção editorial + roteiro + design + audiovisual | Explicação própria com assets finais, direitos e revisão; não confundir teste de pipeline com vídeo publicável. |
| P1 | Registro de produção e experimentos | PA + gestão + dados | Tempo, custo, hipótese, janela e decisão por episódio exportáveis localmente. |
| P1 | Importação de métricas auditável | Dados + engenharia + analista de YouTube | Dataset sintético identificado, importação idempotente, janela/formato/moeda e receita por estado. |
| P1 | Política de YPP datada e por recurso | Compliance + BA + engenharia | Mudança futura não aplicada antes da vigência; regra anterior preservada para histórico. |
| P2 | Upload oficial privado e idempotente | DevOps/segurança + engenharia | Mock de sucesso/401/403/429/5xx; privacidade explícita; retomada não duplica upload. Teste real só autorizado. |
| P2 | Pesquisa de tendências por fonte permitida | Pesquisa + engenharia | Proveniência, quota, data, dedupe e independência; não confundir score com prova de demanda. |
| P2 | Revisão semanal de portfólio e capacidade | Gestão + direção + CEO | Decisão registrada por dados observados; sem ampliar produção para cumprir número arbitrário. |
| P3 | Outras plataformas e automação ampliada | Direção + compliance + engenharia | Somente após operação YouTube sustentável e revisão dos termos de cada rede. |

## 10. Registro de fontes e manutenção

Todas as fontes abaixo foram abertas ou recuperadas pela pesquisa nesta passagem em **27/10/2026**. São fontes primárias. Alguns acessos diretos ao Planalto foram bloqueados; para as leis, foi usado o texto atualizado da Câmara dos Deputados. A leitura não constitui auditoria jurídica completa. As páginas e contratos podem mudar; rever antes de implementação externa, candidatura, mudança de política ou decisão de gasto.

| Fonte | O que sustenta | Estado nesta consulta |
|---|---|---|
| [YouTube — YPP](https://support.google.com/youtube/answer/72851?hl=pt-BR) | Requisitos vigentes, revisão e regras de conta | Acessada; estado do canal do operador não verificado. |
| [YouTube — mudanças anunciadas](https://blog.youtube/intl/pt-br/news-and-events/novas-oportunidades-e-mudancas-programa-de-parcerias-do-youtube/) | Anúncio de 10/08/2026 e vigência em 01/02/2027 | Acessada; termos de conta não aceitos. |
| [YouTube — YPP expandido](https://support.google.com/youtube/answer/13429240?hl=pt-BR) | Distinção entre acesso antecipado e anúncios | Acessada. |
| [YouTube — políticas de monetização](https://support.google.com/youtube/answer/1311392?hl=en) | Originalidade, repetição e conteúdo reutilizado | Acessada. |
| [YouTube — IA](https://support.google.com/youtube/answer/14328491?hl=pt-BR) | Declaração de conteúdo realista sintético/alterado | Acessada. |
| [YouTube — vídeos e Shorts](https://support.google.com/youtube/answer/10059070?hl=en) | Mudança da contagem de views de Shorts | Acessada. |
| [YouTube — teste A/B](https://support.google.com/youtube/answer/16391400?hl=pt-BR) | Testes nativos, limitações e classificação de Shorts | Acessada por redirecionamento de artigo antigo. |
| [YouTube — títulos/miniaturas](https://support.google.com/youtube/answer/12340300?hl=pt-BR) | Embalagem fiel e diagnóstico por audiência | Acessada. |
| [YouTube — RPM/CPM](https://support.google.com/youtube/answer/9314357?hl=pt-BR) | Definições e fontes de receita agregadas | Acessada. |
| [Google Developers — metrics](https://developers.google.com/youtube/analytics/metrics) | Dicionário da API Analytics | Acessada; nenhuma consulta autenticada feita. |
| [Google Developers — upload](https://developers.google.com/youtube/data/reference/rest/v3/videos/insert?hl=en) | Privacidade, campos e quota documentada | Acessada; diverge da regra antiga de projetos não verificados. |
| [Google Developers — revision history](https://developers.google.com/youtube/v3/revision_history) | Histórico da restrição de julho de 2020 | Recuperada; não usada para prevalecer sobre a referência atual. |
| [YouTube — biblioteca de áudio](https://support.google.com/youtube/answer/3376882?hl=pt-BR) | Música, atribuição e monetização na plataforma | Acessada; nenhuma faixa selecionada/baixada. |
| [YouTube — adequação publicitária](https://support.google.com/youtube/answer/6162278?hl=pt-BR) | Anúncios limitados e revisão de metadados | Acessada. |
| [Câmara — Lei 9.610/1998](https://www2.camara.leg.br/legin/fed/lei/1998/lei-9610-19-fevereiro-1998-365399-normaatualizada-pl.html) | Direitos autorais | Texto atualizado acessado. |
| [Câmara — Lei 8.078/1990](https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html) | Identificação e veracidade da publicidade | Texto atualizado acessado. |
| [Câmara — Lei 13.709/2018](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html) | Tratamento de dados pessoais e limites de aplicação | Texto atualizado acessado. |

**Próxima entrega de maior retorno:** substituir o material de demonstração por um único episódio útil, original e revisável, mensurando horas e custo por etapa. Em paralelo, implementar os controles que permitem distinguir fato, direito, aprovação, publicação e receita. O canal só fornece evidência de mercado depois de publicação autorizada e observação real.
