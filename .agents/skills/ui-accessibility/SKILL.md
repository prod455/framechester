---
name: ui-accessibility
description: Implementar ou revisar legibilidade, navegacao e acessibilidade da interface existente do Framechester, incluindo report.html local e uma futura UI quando houver requisito concreto.
license: Apache-2.0
---

# UI e acessibilidade

Siga o [contrato das equipes](../../../docs/EQUIPES_E_SKILLS.md). Inspecione a
superficie existente e use os recursos nativos adequados antes de adotar stack.

1. Defina a tarefa visual e os estados que o operador precisa distinguir.
   Preserve o identificador do canal e a prioridade dos bloqueios de QA.
2. Use estrutura semantica, rotulos claros, hierarquia de titulos e links
   identificaveis. Mantenha texto legivel em telas menores e com zoom.
3. Confira contraste e indicadores de foco. Diferencie status por texto e
   estrutura alem de cor; disponibilize controles de midia utilizaveis por
   teclado e evite movimento automatico desnecessario.
4. Escape conteudo externo antes de inserir no HTML. O relatorio local deve
   funcionar com os artefatos disponiveis e informar links ausentes, mantendo
   chamadas remotas coerentes com a politica de privacidade do projeto.
5. Renderize a interface modificada e verifique teclado, foco, largura reduzida
   e textos longos. Testes de strings HTML ajudam contratos, mas nao substituem
   inspecao da experiencia renderizada.
6. Se uma futura UI usar React, aplique as convencoes reais desse projeto.
   Registre limites da avaliacao e consulte o padrao oficial vigente antes de
   alegar conformidade formal de acessibilidade.

**Artefato:** interface funcional e evidencia visual das verificacoes feitas.
**Aceite:** informacao essencial continua acessivel nos estados avaliados.

**Cenario normal:** relatorio apresenta video e gates por canal com teclado.
**Cenario adverso:** titulo externo com markup aparece como texto e nao executa.
