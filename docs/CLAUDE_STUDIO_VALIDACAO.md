# Claude no Studio — validação de 28/10/2026

O Studio integra a API Anthropic às tarefas de pauta, roteiro e storytelling.
O motor Rust mantém seu adapter e suas restrições anteriores.

## Aceite verificado

| Comportamento | Evidência |
|---|---|
| Endpoint fixo, autenticação, versão, contagem e saída estruturada | `web/tests/anthropic.test.ts` |
| Chave isolada por canal, nunca devolvida em configuração ou bootstrap | `creative-anthropic.test.ts` e `creative-anthropic-http.test.ts` |
| Consentimento para transmissão antes da contagem; geração só após autorização | Testes de serviço, HTTP e UI |
| Estimativa com uso único e validade de cinco minutos | Sessão, canal, conteúdo, preferências, chave e expiração testados |
| Estimativa acima do limite bloqueia a geração | Teste de custo; sem chamada Messages |
| Falha paga não provoca repetição automática | Transporte e UI; autorização consumida antes do efeito |
| Falha na contagem informa que não houve geração | Teste de UI específico |
| Contar tokens conserva a proteção do briefing não salvo | Regressão reproduzida e corrigida em `creative-ui.test.ts` |
| Rascunhos não aprovam nem persistem conteúdo editorial | Testes de serviço/HTTP e aplicação manual no navegador |
| Configuração antiga Ollama preservada | Testes de migração do armazenamento privado |

`npm --prefix web test`: **128 testes aprovados**. `check` e build passaram.
Não foram necessárias alterações no motor Rust nesta fatia.

## Conferência visual e operacional

Perfil descartável `artifacts/claude-qa/profile`, prompt e chave inteiramente
sintéticos, transporte de modelo simulado. No navegador foram exercitados:
configurações, gravação da chave, estimativa sem geração, segundo clique de
autorização, proposta estruturada e aplicação manual aos campos do editor.

Em 1280 px, os controles de custo e saída tiveram a mesma borda superior
(469 px), altura de 44 px e largura de 416,5 px. Em 390 × 844 px, os cinco
controles visíveis de configuração compartilharam a borda esquerda de 32 px
e largura de 311 px; os controles simples mantiveram altura de 44 px.
Os dois botões da barra do assistente tiveram 163,5 × 44 px, com o mesmo topo.
Não houve overflow horizontal da página ou do diálogo nessas capturas.

Capturas privadas e ignoradas pelo Git: `artifacts/claude-qa/estimate-desktop.png`,
`estimate-mobile.png` e `settings-mobile.png`.

O Studio do operador foi reiniciado em `127.0.0.1:4317` depois de verificar zero
jobs em fila/execução; a sessão precisa ser reaberta. O perfil, a senha, o prompt
pessoal e as credenciais reais não foram alterados.

## Limites da validação

Nenhuma chave real foi usada e nenhuma inferência paga foi efetuada. A qualidade
editorial, o acesso da conta ao modelo e a operação real da API continuam a ser
verificados pelo operador após conectar sua chave. Os testes demonstram contratos
com respostas simuladas, não comportamento semântico de um LLM real.

Os preços datados e a contagem de tokens produzem estimativa com margem, sem
garantir teto da fatura. O limite financeiro efetivo também deve ser configurado
na Anthropic. O contexto é enviado ao provedor somente após o pedido explícito;
ele inclui as preferências pessoais. Não existe navegação web autônoma, execução
de skills externas, aprovação editorial ou publicação por esse conector.
