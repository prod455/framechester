---
name: dx-maintenance
description: Melhorar instalacao, comandos, diagnosticos e manutencao do Framechester quando o operador ou contribuidor encontra erro reproduzivel de ambiente ou uso.
license: Apache-2.0
---

# DX e manutencao

Leia o [contrato das equipes](../../../docs/EQUIPES_E_SKILLS.md) e o comando
real em questao antes de editar instrucoes.

1. Reproduza a dificuldade a partir do diretorio e shell informados. Confira
   versoes, PATH e arquivos opcionais sem imprimir valores de credenciais.
2. Diferencie ferramenta ausente, configuracao invalida e bug da aplicacao.
   Preserve o primeiro erro util e indique a acao que o operador pode executar.
3. Simplifique a jornada mais frequente: instalar, diagnosticar, selecionar
   canal, executar e localizar artefatos. Mantenha flags e exemplos coerentes
   com a ajuda gerada pela CLI.
4. Para defaults novos, preserve configuracoes existentes e valide entradas
   antes de iniciar TTS, render ou chamada externa. Erros devem ter exit code
   consistente e contexto suficiente para diagnostico local.
5. Teste o caminho principal e um ambiente incompleto com fixtures sanitizadas.
   Confira Windows e Linux quando ambos estiverem disponiveis; registre qual
   plataforma foi realmente executada.
6. Atualize apenas a documentacao afetada e remova exemplos invalidados. Para
   diagnostico compartilhavel, mostre estados e versoes, mantendo caminhos
   privados e segredos fora de artefatos publicos.

**Artefato:** comando ou diagnostico melhorado, exemplo executavel e evidencia.
**Aceite:** operador consegue completar a tarefa ou corrigir a dependencia com
a mensagem apresentada, sem entrevista sobre informacao ja disponivel.

**Cenario normal:** instalacao limpa chega a um dry-run com canal explicito.
**Cenario adverso:** Piper ausente gera erro preciso antes de iniciar producao.
