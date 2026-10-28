---
name: ffmpeg-quality-gate
description: Verificar integridade técnica e apresentação audiovisual de um render Framechester com FFmpeg/ffprobe, sem confundir aprovação técnica com editorial.
license: Apache-2.0
---

# QA audiovisual

Use o [contrato das equipes](../../../docs/EQUIPES_E_SKILLS.md) e identifique canal, perfil de destino e hash do vídeo. Preserve o arquivo original durante diagnóstico.

1. Confirme versões, disponibilidade dos filtros e parâmetros do render. Encoder listado não comprova execução ou qualidade útil no hardware.
2. Execute ffprobe e decodificação completa; verifique container, streams, dimensões, fps, timestamps e duração em relação ao perfil solicitado.
3. Analise preto, freeze, silêncios e clipping com os controles existentes. Compare alertas ao storyboard: uma pausa intencional não é falha automática.
4. Quando ASR estiver disponível, compare fala e legenda, revisando nomes e siglas. Cobertura de palavras é alerta, não prova de compreensão, sincronia perfeita ou veracidade.
5. Inspecione frames representativos e transições, início/fim, legibilidade e mixagem. Registre limitações do método e dos segmentos efetivamente vistos.

**Artefato:** relatório técnico por arquivo/hash com comandos, versões, checks, evidências e status Pass/Fail/NeedsHuman/Skipped.

**Aceite:** falha bloqueia publicação; aprovação técnica encaminha revisão editorial e direitos, sem substituí-las. Comparação CPU/GPU informa cena, parâmetros e custo de execução.

**Avaliações:**
- Normal: vídeo íntegro com pausa prevista; registrar alerta contextual sem inventar defeito.
- Adverso: MP4 tem áudio cortado apesar de abrir no player; decodificar e bloquear pela divergência observada.
