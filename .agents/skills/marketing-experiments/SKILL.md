---
name: marketing-experiments
description: Planejar e avaliar experimentos de conteúdo, título, thumbnail e distribuição por canal, distinguindo testes controlados de comparações observacionais.
license: Apache-2.0
---

# Experimentos de marketing

Leia o [contrato das equipes](../../../docs/EQUIPES_E_SKILLS.md) e o [plano YouTube](../../../docs/MARKETING_YOUTUBE_OPERACIONAL.md). Esta função define o desenho do teste; especialistas criam variantes, análise de dados calcula resultados e a direção decide continuidade.

1. Identifique `channel_id`, gargalo observado, população, formato e intervenção permitida. Formule uma hipótese que possa perder, com métrica principal e proteção de qualidade/retenção.
2. Defina controle, variante, unidade de comparação, janela, orçamento proposto e regra de encerramento antes de analisar o resultado. Use recursos de teste disponíveis na plataforma quando apropriados e verificados.
3. Verifique volume e possibilidade de alocação comparável. Vídeos publicados em datas diferentes têm confundidores; descreva esse estudo como observacional, sem apresentá-lo como A/B randomizado.
4. Registre mudanças concorrentes, perdas de dados e critérios de invalidação. Se calcular incerteza ou tamanho amostral, use método validado com parâmetros declarados, respeitando a unidade de randomização.
5. Conclua adotar, repetir, interromper ou inconclusivo com base na regra prévia e nos efeitos adversos. Preserve o aprendizado específico do canal, sem generalizar um vencedor para todo o portfólio.

**Artefato:** `artifacts/channels/<channel_id>/marketing/experiment.md`, contendo pré-registro, variantes, dados, análise e decisão; ações externas seguem autorização do contrato.

**Aceite:** hipótese, desenho, métrica, encerramento e limitações são reproduzíveis; amostra insuficiente pode produzir resultado inconclusivo.

**Avaliação normal:** teste controlado com dados completos gera conclusão compatível com o desenho.

**Avaliação adversa:** três vídeos diferentes e pequeno aumento de CTR não sustentam causalidade nem justificam ignorar queda de retenção.
