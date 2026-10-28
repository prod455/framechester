---
name: storage-disaster-recovery
description: Planejar e validar backup e restauração de artefatos Framechester por canal usando restic e checagem de integridade, com custos remotos explícitos.
license: Apache-2.0
---

# Backup e recuperação

Use o [contrato das equipes](../../../docs/EQUIPES_E_SKILLS.md). Defina canais, diretórios, dados irrecuperáveis e objetivo de restauração antes de movimentar arquivos.

1. Inventarie projetos, roteiros, direitos, fontes, arquivos finais, metadados e banco existente. Separe caches regeneráveis de ativos únicos; preserve isolamento por `channel_id`.
2. Confirme origem/destino absolutos, capacidade e credenciais por gerenciador local. Senha, endpoint privado e conteúdo pessoal não entram em exemplos, logs públicos ou commits.
3. Calcule retenção e custos pela tabela atual do provedor, considerando operações/tráfego; simulador não comprova fatura. Operação remota paga exige autorização específica.
4. Prefira validar localmente snapshot e restauração para diretório temporário. Compare presença e hashes dos arquivos; classifique avisos de timestamp separadamente de perda de conteúdo.
5. Documente recuperação, chaves necessárias, retenção e próximo ensaio. Antes de expurgar snapshots ou arquivos, apresente alvo concreto e preserve os limites autorizados.

**Artefato:** runbook e recibo de ensaio com snapshot, escopo, comandos, hashes, falhas e capacidade de recuperação demonstrada.

**Aceite:** restaurar dados úteis com integridade comprovada; snapshot criado sem restore não prova recuperação.

**Avaliações:**
- Normal: restaurar projeto de A em pasta temporária com hashes idênticos.
- Adverso: restore de B aponta para pasta ativa de A; interromper antes da escrita e corrigir o destino.
