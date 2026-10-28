---
name: security-review
description: Investigar e corrigir riscos concretos de segredos, entradas externas, caminhos, efeitos de rede e autorizacao nas mudancas do Framechester.
license: Apache-2.0
---

# Revisao de seguranca

Aplique o [contrato das equipes](../../../docs/EQUIPES_E_SKILLS.md) e consulte
achados pertinentes da [auditoria](../../../docs/AUDITORIA_ENGENHARIA.md).

1. Mapeie entrada controlavel, recurso protegido e efeito relevante da mudanca.
   Distinga arquivo local escolhido pelo operador de material remoto nao
   confiavel e configuracao de credenciais.
2. Trace validacao ate o ponto do efeito. Para caminhos, confira resolucao,
   aliases, symlinks e destino de escrita. Para rede, avalie destino, redirects,
   timeout e envio de cabecalhos ou segredos.
3. Reproduza o risco com dados inteiramente sinteticos e pela interface publica.
   Priorize vazamento, perda de arquivos, mistura de canais e efeito nao
   autorizado em vez de listas abstratas de ameacas.
4. Corrija a menor fronteira adequada. Prefira erros explicitos, restricoes de
   protocolo e redaction; uma lista textual de padroes nao certifica isolamento.
5. Verifique comportamento permitido e tentativa adversa. Confira logs, Debug,
   mensagens de erro e artefatos para evitar propagacao de valores sensiveis.
6. Relate severidade, evidencia, explorabilidade e limites do teste. Analise
   estatica sem reproducao permanece identificada como tal; conclusoes de
   seguranca devem ficar limitadas ao escopo realmente examinado.

**Artefato:** achado reproduzivel, correcao e regressao negativa.
**Aceite:** efeito protegido bloqueado no caso adverso e fluxo autorizado preservado.

**Cenario normal:** asset declarado e integro permanece utilizavel localmente.
**Cenario adverso:** manifesto com travessia de diretorio falha sem ler o destino.
