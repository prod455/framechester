---
name: ux-operator-workflow
description: Desenhar ou melhorar o fluxo operacional local do Framechester quando selecao de canal, estados, revisao ou recuperacao de erro dificultam produzir e acompanhar um video.
license: Apache-2.0
---

# UX do operador

Use o [contrato das equipes](../../../docs/EQUIPES_E_SKILLS.md). Trabalhe sobre
a CLI e o relatorio existentes; novas superficies exigem necessidade observada.

1. Identifique a tarefa, o canal e o ponto em que o operador perde contexto.
   Registre o percurso atual com entradas, decisoes e artefatos de cada etapa.
2. Defina estados observaveis para pronto, executando, bloqueado, falha e
   revisao pendente. Mostre a proxima acao pertinente e preserve o motivo.
3. Torne visiveis o canal selecionado, o formato e o destino dos arquivos antes
   de efeitos relevantes. Separe configuracao compartilhada das escolhas
   editoriais de cada canal.
4. Proponha a menor mudanca de fluxo que elimina a dificuldade. Preserve
   retomada e acesso ao trabalho ja produzido; a recuperacao nao deve exigir
   apagar artefatos ou repetir etapas caras sem motivo.
5. Exercite um percurso completo e uma falha realista com dados sinteticos.
   Confira ajuda da CLI, texto de erro e relatorio local com as mesmas palavras.
6. Registre o que foi observado e o que ainda precisa de avaliacao humana.
   Encaminhe ajustes visuais para UI e prioridades de produto para PA.

**Artefato:** fluxo revisado e mudanca funcional com evidencia da jornada.
**Aceite:** operador identifica contexto, estado e proxima acao sem adivinhar.

**Cenario normal:** revisar um render mostra canal, QA e links do proprio job.
**Cenario adverso:** duas configuracoes de canal exigem selecao explicita antes
de iniciar um trabalho com destino ambiguo.
