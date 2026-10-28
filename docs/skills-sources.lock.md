# Curadoria de fontes de skills

Consulta original: **2026-10-27**, data do operador em America/Sao_Paulo. Este registro fixa as referências consultadas; não é um instalador nem uma auditoria de segurança de terceiros.

**Adendo de 28/10/2026:** `frontend-design` da Anthropic foi instalada no projeto para a reformulação solicitada do Studio, com revisão fixa e licença individual preservada. A afirmação histórica abaixo de nenhuma skill externa instalada descreve a entrega de 27/10, não o estado após esse adendo. Fontes, hashes, critérios e limites da nova seleção estão em [UI_SKILLS_SOURCES.md](UI_SKILLS_SOURCES.md). `web-design-guidelines` continua somente referência, sem cópia local.

**Segundo passe de 28/10/2026:** também foi instalada a skill oficial `impeccable`, de `pbakaus/impeccable`, revisão `8409a564d1baee90b2dde4f7a8f06288838e3921`, Apache-2.0. O inventário de UI registra os hashes e a execução do engine externo, com telemetria desligada. O projeto contém agora 33 procedimentos originais e duas skills externas.

As skills locais são instruções **originais**, licenciadas Apache-2.0, escritas para os contratos do Framechester. Nenhuma skill externa desta lista foi instalada ou redistribuída nesta entrega. Skills já existentes no ambiente permanecem dependências opcionais do operador. Os SKILL.md externos foram examinados em seus gatilhos, fluxo principal e seções críticas de permissões, dados e saída; suas integrações e scripts não foram executados nem integralmente auditados.

## Revisões e licenças

SHAs resolvidos pela API primária `https://api.github.com/repos/<owner>/<repo>/commits/main`. Estrelas são fotografia da consulta, não critério suficiente de qualidade.

| Repositório | Revisão resolvida | Estrelas via GitHub API | Licença examinada / estado |
| --- | --- | ---: | --- |
| [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) | `0cd9b3a0ef4c411a1d690419ce843f2a1da32cce` | 56.922 | [MIT](https://github.com/coreyhaines31/marketingskills/blob/0cd9b3a0ef4c411a1d690419ce843f2a1da32cce/LICENSE); referência examinada |
| [phuryn/pm-skills](https://github.com/phuryn/pm-skills) | `07b34f64ee828df08953f505b7f747aef85ae7c6` | 27.449 | [MIT](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/LICENSE); referência examinada |
| [mattpocock/skills](https://github.com/mattpocock/skills) | `59db609eb1e18aaf59b63284d0e52255aff0c63c` | 304.906 | MIT informada pela API; conteúdo usado nesta curadoria veio das cópias locais já disponíveis, sem afirmar equivalência byte a byte com esse SHA |
| [anthropics/skills](https://github.com/anthropics/skills) | `dbd4588f9e1033efb41dad4bef2f7947c8993d44` | 184.263 | [Apache-2.0 de frontend-design](https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/frontend-design/LICENSE.txt); não presumir licença única para todo o repositório |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62` | 33.113 | Licença de redistribuição não confirmada nesta consulta; somente referência |
| [openai/skills](https://github.com/openai/skills) | `49f948faa9258a0c61caceaf225e179651397431` | 28.344 | Apache-2.0 confirmada nos LICENSE.txt individuais dos três diretórios examinados; somente referência |

O [leaderboard skills.sh](https://skills.sh/) foi consultado antes da seleção. Contagens verificadas nas páginas individuais: [copywriting](https://skills.sh/coreyhaines31/marketingskills/copywriting) **237,5 mil** instalações, [content-strategy](https://skills.sh/coreyhaines31/marketingskills/content-strategy) **165,5 mil**, [marketing-plan](https://skills.sh/coreyhaines31/marketingskills/marketing-plan) **68,9 mil**. São números exibidos pelo diretório, sem verificação independente de instalações reais. O diretório exibia advertência Snyk para content-strategy; isso reforça tratar a seleção como referência, não como aprovação de execução. Contagens individuais das demais skills não foram verificadas.

## Marketing: 13 SKILL.md examinados

Todos os links abaixo fixam a revisão de marketingskills acima. Estado de cada linha: **referência, não instalada**. Os nomes são os da versão 2; evitar instalar versões antigas com nomes diferentes em paralelo.

| Skill e fonte | Aplicação e compatibilidade |
| --- | --- |
| [product-marketing](https://github.com/coreyhaines31/marketingskills/blob/0cd9b3a0ef4c411a1d690419ce843f2a1da32cce/skills/product-marketing/SKILL.md) | Contexto compartilhado de público, voz e evidências; adaptar para um brief por canal, distinguindo audiência do canal e usuário do software |
| [customer-research](https://github.com/coreyhaines31/marketingskills/blob/0cd9b3a0ef4c411a1d690419ce843f2a1da32cce/skills/customer-research/SKILL.md) | JTBD e pesquisa rastreável; posts externos tratados como dados não confiáveis; entrevistas não autorizam contato automático |
| [content-strategy](https://github.com/coreyhaines31/marketingskills/blob/0cd9b3a0ef4c411a1d690419ce843f2a1da32cce/skills/content-strategy/SKILL.md) | Pilares e calendário com contribuição original; prioridades SEO e proporções propostas são hipóteses, não leis do YouTube |
| [copywriting](https://github.com/coreyhaines31/marketingskills/blob/0cd9b3a0ef4c411a1d690419ce843f2a1da32cce/skills/copywriting/SKILL.md) | Alegações sustentáveis e linguagem específica; foco principal em páginas, por isso roteiro recebe skill local própria |
| [copy-editing](https://github.com/coreyhaines31/marketingskills/blob/0cd9b3a0ef4c411a1d690419ce843f2a1da32cce/skills/copy-editing/SKILL.md) | Revisões focadas preservando voz e mensagem |
| [social](https://github.com/coreyhaines31/marketingskills/blob/0cd9b3a0ef4c411a1d690419ce843f2a1da32cce/skills/social/SKILL.md) | Calendário, storytelling e Shorts; contém proibição explícita de autopublicar sem autorização |
| [analytics](https://github.com/coreyhaines31/marketingskills/blob/0cd9b3a0ef4c411a1d690419ce843f2a1da32cce/skills/analytics/SKILL.md) | Janelas compatíveis, cálculos reproduzíveis e ausência de PII em UTMs; configuração de GA4/GTM não é necessária ao worker local |
| [ab-testing](https://github.com/coreyhaines31/marketingskills/blob/0cd9b3a0ef4c411a1d690419ce843f2a1da32cce/skills/ab-testing/SKILL.md) | Hipótese, amostra e encerramento; não confundir uploads sucessivos com experimento randomizado |
| [attribution](https://github.com/coreyhaines31/marketingskills/blob/0cd9b3a0ef4c411a1d690419ce843f2a1da32cce/skills/attribution/SKILL.md) | Explicita incerteza causal e deduplicação; instrumentação de identidade não é ativada automaticamente |
| [ad-creative](https://github.com/coreyhaines31/marketingskills/blob/0cd9b3a0ef4c411a1d690419ce843f2a1da32cce/skills/ad-creative/SKILL.md) | Variantes com inputs rastreáveis; reservado a publicidade solicitada, sem lançamento ou gasto implícito |
| [video](https://github.com/coreyhaines31/marketingskills/blob/0cd9b3a0ef4c411a1d690419ce843f2a1da32cce/skills/video/SKILL.md) | Condicional: propõe React/HTML e APIs pagas; não substituir Rust/FFmpeg. Estatística de audiência sem som e preços citados exigem nova verificação |
| [marketing-plan](https://github.com/coreyhaines31/marketingskills/blob/0cd9b3a0ef4c411a1d690419ce843f2a1da32cce/skills/marketing-plan/SKILL.md) | Não adotada como orquestrador: 13 seções, horizonte anual, funil SaaS e armazenamento externo ao repo não correspondem à execução de vídeos por canal |
| [marketing-council](https://github.com/coreyhaines31/marketingskills/blob/0cd9b3a0ef4c411a1d690419ce843f2a1da32cce/skills/marketing-council/SKILL.md) | Não adotada: simula personalidades e força divergência; uma equipe com responsáveis e evidências atende melhor ao pedido |

## BA, produto, QA e CEO: 12 SKILL.md examinados

Todos são referências MIT de phuryn/pm-skills na revisão fixada, **não instaladas**. A nomenclatura BA significa Business Analyst. O roteiro de produto deve preservar o objetivo de produzir vídeos e operar vários canais sob o mesmo operador.

| Skill e fonte | Aplicação e ajuste necessário |
| --- | --- |
| [create-prd](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-execution/skills/create-prd/SKILL.md) | PRD enxuto com hipóteses explícitas; ler fontes de verdade antes de perguntar informações já documentadas |
| [user-stories](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-execution/skills/user-stories/SKILL.md) | Critérios observáveis e fatias pequenas; design links somente quando existirem |
| [test-scenarios](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-execution/skills/test-scenarios/SKILL.md) | Condições iniciais, passos e resultados esperados; complementar com execução TDD real |
| [prioritization-frameworks](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-execution/skills/prioritization-frameworks/SKILL.md) | Escolha de método conforme dados; pontuação de oportunidade deve ser rotulada como estimativa quando não houver pesquisa |
| [pre-mortem](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-execution/skills/pre-mortem/SKILL.md) | Riscos concretos e mitigação; prazos exemplificados não viram compromisso do projeto |
| [customer-journey-map](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-market-research/skills/customer-journey-map/SKILL.md) | Jornada do operador e do espectador separadas; não inventar onboarding SaaS inexistente |
| [metrics-dashboard](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-product-discovery/skills/metrics-dashboard/SKILL.md) | Indicadores que mudam decisões, origem e alertas; relatório local pode bastar, sem novo dashboard obrigatório |
| [opportunity-solution-tree](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-product-discovery/skills/opportunity-solution-tree/SKILL.md) | Resultado → necessidade → solução → experimento; preservar casos e capacidade reais |
| [business-model](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-product-strategy/skills/business-model/SKILL.md) | Modelar operação de mídia, incluindo plataforma, público, custos e receitas; não presumir assinatura do software |
| [monetization-strategy](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-product-strategy/skills/monetization-strategy/SKILL.md) | Estratégias como hipóteses; YPP e lucro dependem de evidência atual. Percentuais genéricos de conversão não são projeções do canal |
| [cohort-analysis](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-data-analytics/skills/cohort-analysis/SKILL.md) | Validar dados e janelas antes de tendências; retenção de usuários do software difere de retenção de vídeo |
| [ab-test-analysis](https://github.com/phuryn/pm-skills/blob/07b34f64ee828df08953f505b7f747aef85ae7c6/pm-data-analytics/skills/ab-test-analysis/SKILL.md) | Incerteza e decisão; fórmulas simplificadas da referência precisam de método estatístico validado, incluindo poder e unidade amostral |

## UX/UI, QA e DevOps: seis referências condicionais

| Skill e fonte | Estado e limite |
| --- | --- |
| [frontend-design](https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/frontend-design/SKILL.md) | Referência Apache-2.0 examinada; aplicável ao relatório HTML existente ou UI explicitamente pedida, sem migração de stack |
| [webapp-testing](https://github.com/anthropics/skills/blob/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/webapp-testing/SKILL.md) | Referência examinada; Playwright somente para superfície web existente; scripts não executados, licença individual não confirmada |
| [web-design-guidelines](https://github.com/vercel-labs/agent-skills/blob/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/web-design-guidelines/SKILL.md) | Referência examinada; busca regras remotas atualizadas, por isso congelar evidência da revisão e preservar contrato local |
| [gh-fix-ci](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/gh-fix-ci/SKILL.md) | Referência Apache-2.0 examinada; exige GitHub/PR e fluxo específico de aprovação, sem aplicabilidade automática a falha local de build |
| [security-threat-model](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/security-threat-model/SKILL.md) | Referência Apache-2.0 examinada; só para pedido de modelagem de ameaças, não para toda alteração |
| [security-best-practices](https://github.com/openai/skills/blob/49f948faa9258a0c61caceaf225e179651397431/skills/.curated/security-best-practices/SKILL.md) | Referência Apache-2.0 examinada; suporta Python/JS/TS/Go, não Rust; não rotular revisão Rust como coberta por ela |

Total acima: **31 SKILL.md externos examinados**, todos como referências. Isso não significa 31 skills instaladas nem 31 auditorias completas.

## Fontes locais já disponíveis

Revisados os gatilhos, fluxo e instruções críticas das cópias locais: `tdd`, `diagnosing-bugs`, `code-review`, `codebase-design`, `domain-modeling`, `research`, `writing-for-agents`; os sete módulos de Engenharia Prática; os cinco de Draftmoor Creative Studio; os quatro de Reels Work Studio; os sete de Logo Strategy Studio. Esses grupos somam **30 SKILL.md locais examinados**. Não foram copiados para o projeto.

- Engenharia: TDD por interface pública, diagnóstico reproduzível, qualidade com evidência e arquitetura do projeto precedem preferências genéricas de estilo.
- Design: Draftmoor e Logo Strategy são condicionais a anúncios/produtos ou identidade; não obrigam refazer a marca do canal.
- Audiovisual: Reels Work Studio cobre footage real e formatos verticais; não define automaticamente a produção de vídeos longos em Rust/FFmpeg.
- `code-review` pressupõe ponto de comparação e issue tracker; uma auditoria do sistema inteiro precisa do fluxo local, sem inventar esses insumos.

## Seleção, conflitos e futuras atualizações

Adotar primeiro as skills locais específicas, com contrato compartilhado e carga sob demanda. Conteúdo de terceiros serve como evidência e técnica; não recebe autoridade sobre autorização, dados, stack ou objetivo do operador.

Não adicionar automaticamente: stacks React/Next, Kubernetes/VPS, anúncios pagos, prospecção/mensagens, autopublicação ou coleções inteiras de produtividade. Cada item precisa de demanda concreta. Para múltiplos canais, a seleção exige canal explícito nos artefatos e isolamento de identidade, credenciais, métricas, orçamento e estado.

O [repositório de Dean Peters](https://github.com/deanpeters/Product-Manager-Skills) foi consultado para avaliar origem e licença, mas seus SKILL.md não entram na contagem acima. O README informa CC BY-NC-SA 4.0 e permissões próprias; não foi incorporado ao projeto Apache-2.0. Não se trata de afirmar proibição de todo uso empresarial, e sim de evitar redistribuição sem resolver termos.

Para atualizar: resolver novo SHA, ler o diff das skills relevantes e suas licenças, rever instruções de ferramentas/permissões, executar os cenários normal e adverso locais e atualizar este registro. Popularidade não substitui revisão. Instalação futura é uma mudança separada: preservar LICENSE/NOTICE, referências necessárias e compatibilidade com o contrato.
