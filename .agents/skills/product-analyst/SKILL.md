---
name: product-analyst
description: Definir fatias de produto, backlog, eventos e critérios de aceite do Framechester quando uma necessidade de produção precisa virar comportamento implementável.
license: Apache-2.0
---

# Product analyst

Leia o [contrato das equipes](../../../docs/EQUIPES_E_SKILLS.md) e examine a CLI, domínio e testes existentes antes de especificar mudança. Use `channel_id` como contexto da operação multicanais de um único operador.

1. Descreva a tarefa do operador, gatilho, entrada, saída e falhas. Localize o atrito real no caminho pauta → roteiro → assets → QA → pacote → publicação permitida → análise.
2. Escolha uma fatia que entregue resultado utilizável. Preserve integrações locais, interfaces existentes e comportamento documentado; não acrescentar painel, serviço ou dependência sem necessidade demonstrada.
3. Escreva aceites positivos e negativos na fronteira pública: arquivo válido/inválido, canal correto/incorreto, aprovação presente/pendente e retomada após falha.
4. Defina eventos locais com origem, horário e canal; dados desconhecidos continuam desconhecidos. Registro de métrica não é coleta central autorizada.
5. Ordene trabalho por risco reduzido e valor entregue. Entregue para engenharia contrato e exemplos suficientes para TDD.

**Artefato:** especificação curta com jornada, contrato de entrada/saída, exemplos, compatibilidade, métricas e plano de fatias.

**Aceite:** é possível demonstrar o resultado e as falhas sem serviços pagos nem contas reais; testes não dependem de detalhes internos.

**Avaliações:**
- Normal: importar roteiro autoral preservando falas; especificar arquivo, vínculo ao tópico e teste de incompatibilidade.
- Adverso: pedido multicanais vira SSO/billing; manter isolamento por canal e excluir expansão não solicitada.
