# Validação do Framechester Studio local

**Fatia mais recente — alinhamento minucioso:** skill pessoal
`precise-ui-alignment` criada e aplicada; cabeçalhos, abas, campos, ícones,
recuos e navegação refatorados com medidas do render. **348 relações em 45
combinações** passaram na tolerância de 0,5 px; **103 testes web**, build e
10 testes do checker aprovados. Ver [ALIGNMENT_QA.md](ALIGNMENT_QA.md).

**Fatia anterior — overflow:** **103 testes web**, TypeScript e build
aprovados. Dados longos sem espaços em nove telas e abas/diálogos foram
conferidos em 320, 390, 760 e 1280 px: **84 estados sem vazamento de página,
elementos ou texto nos escopos registrados**. Ellipsis conserva os rótulos
completos; leitura e valores continuam íntegros. Tabelas largas têm rolagem
interna. Ver [OVERFLOW_QA.md](OVERFLOW_QA.md) para medições e limites.

**Fatia anterior — frontend Basecoat, UX, QA e DX:** **100 testes web**,
TypeScript e build aprovados; auditoria npm sem vulnerabilidades reportadas.
Abas reais Basecoat, assistente no próprio editor, toolbar de ações e seletor
móvel de documento conferidos no navegador. Duas regressões DOM reproduziram
validação terminando na aba errada e status de geração mantido após erro;
ambas foram corrigidas. O proxy de desenvolvimento agora acompanha a porta
configurada. Evidências e limites em [UI_REVIEW_20261028.md](UI_REVIEW_20261028.md).

**Fatia anterior — briefing criativo:** **93 testes web** e build
TypeScript/Vite aprovados. Pauta, roteiro e narrativa usam campos atuais e
vínculos do próprio canal, com preview e aplicação explícita sem salvar ou
aprovar. O navegador exercitou geração, aplicação e salvamento em perfil
isolado com transporte de modelo simulado; o serviço Ollama real não
comprovou prontidão. Ver [BRIEFING_CRIATIVO.md](BRIEFING_CRIATIVO.md).

Passe concluído em 28/10/2026, Windows, Node 22.23.4. A operação está descrita em [WEB_STUDIO.md](WEB_STUDIO.md); as capacidades sociais, em [REDES_SOCIAIS_WEB.md](REDES_SOCIAIS_WEB.md).

**Revisão posterior de prontidão local:** [PRONTIDAO_USO_LOCAL.md](PRONTIDAO_USO_LOCAL.md)
registra as correções adicionais, **72 testes web** aprovados e um novo job
real com 12 checks técnicos aprovados. As contagens de 62 testes abaixo
pertencem aos passes anteriores de interface e assistente.

**Migração Basecoat posterior:** a suíte passou a **78 testes web**, incluindo
seis contratos DOM de componentes com Happy DOM. Build TypeScript/Vite
aprovado, dependências consultadas sem vulnerabilidades reportadas, teclado e
layout móvel conferidos no navegador. Implementação e limites registrados no
[design system](DESIGN_SYSTEM.md#basecoat). Não foi repetido o render Rust,
pois esta mudança altera controles e estilos do frontend.

## Verificações automatizadas

- `npm --prefix web run build`: TypeScript estrito, verificação de imports/parâmetros não usados e build Vite aprovados. No passe Impeccable final, JavaScript de 70,21 kB, 23,74 kB gzip; CSS de 27,83 kB, 6,19 kB gzip. Esses tamanhos não são benchmark de latência.
- `npm --prefix web test`: **62 testes aprovados** no passe final, incluindo fluxo da próxima ação, prompt privado e assistente local. Também cobrem autenticação/CSRF, armazenamento, isolamento por canal, API HTTP, arquivos com Range, fila Rust, escolha explícita de voz, financeiro, redes e cofre. O teste DPAPI usou credenciais sintéticas no Windows; em outro sistema ele é ignorado e não existe fallback de segredo em texto puro.
- `npm --prefix web audit --audit-level=high`: nenhuma vulnerabilidade conhecida reportada nesse passe. Isso não constitui certificação de segurança.
- Workspace preservado: 135 testes Rust aprovados, um smoke de mídia ignorado na suíte padrão; Clippy com `-D warnings` e `cargo fmt --all --check` aprovados. Python: 51 testes aprovados.
- CI web adicionada para Windows e Ubuntu. O workflow remoto não foi executado nesta sessão.

## Passe real pelo navegador e motor

Foi usado exclusivamente o perfil descartável `artifacts/web-qa-20261027`, separado do perfil padrão do operador. A senha sintética foi preparada pela API local; nenhuma conta social real foi conectada. Os dados de teste não são faturamento, público ou conteúdo privado do operador.

Fluxos observados: login; criação de canal; persistência de pauta e arco narrativo; edição e salvamento de roteiro; configuração por canal; upload autenticado de quatro clipes originais; associação de cenas; início de produção; atualização de status; abertura do vídeo e links do pacote. Os dados persistiram após reiniciar o serviço. A navegação também foi conferida em viewport de 390 × 844, além da tela desktop. Não houve erros ou avisos no console durante a verificação final.

O primeiro job revelou uma incompatibilidade real na serialização das métricas do tópico para Rust. Uma regressão foi acrescentada antes da correção. O runner agora fornece os sete campos exigidos; campos editoriais não medidos permanecem zero e não são apresentados como demanda observada. A falha inicial continua no histórico do perfil de QA.

O novo job `c2ada714-17a7-47d3-a0ab-f42ee19a0c4b`, canal `studio-qa`, terminou com vídeo disponível e estado `needs_review`:

- MP4: 76,460458 segundos; 360 × 640; 30 fps; H.264/AAC, áudio estéreo de 48 kHz; 3.129.710 bytes.
- SHA-256 conferido contra o relatório: prefixo `74a63b44`, sufixo `80f78`.
- QA técnico: 12 verificações aprovadas, incluindo decodificação, preto/congelamento e áudio.
- ASR: cobertura de 81% contra mínimo configurado de 45%; cobertura não significa precisão de transcrição.
- Editorial: revisão humana pendente; duas alegações continuam apenas `Cited`. Salvar o roteiro ou declarar conferência não as promove automaticamente a fatos verificados.
- Publicação: `dry_run`, sem ID externo ou data de publicação. Nenhum pagamento, custo ou receita de rede foi criado pelo teste.

O endpoint real de vídeo retornou `206`, `Content-Range: bytes 0-1023/3129710` e exatamente 1.024 bytes para uma sessão autenticada. A mesma URL sem sessão retornou `401`. Troca de canal, alias de arquivo inválido e intervalos fora do arquivo também estão cobertos na suíte HTTP.

Artefatos locais ignorados pelo Git:

- `artifacts/web-qa-20261027/production/jobs/studio-qa/c2ada714-17a7-47d3-a0ab-f42ee19a0c4b/output/channels/studio-qa/`
- `artifacts/web-qa-20261027/screenshots/studio-visao-geral.jpg`
- `artifacts/web-qa-20261027/screenshots/producao-revisao.jpg`

## Limites da evidência

OAuth, refresh, respostas das quatro redes e falhas de identidade foram exercitados com fixtures. O fluxo com contas reais depende da configuração e autorização do operador e não foi validado nesta sessão. A pesquisa YouTube sem conexão mostrou a instrução de conectar a conta e preservou a pesquisa manual.

Estimativas, pagamentos manuais e custos permanecem separados; ausência aparece como desconhecida. O piloto não comprova elegibilidade, lucro, direitos comerciais da voz/modelo ou aprovação editorial. A investigação posterior dos model cards identificou a cadeia Faber → Lessac → materiais Blizzard com licença de pesquisa: autorização comercial do ONNX não foi demonstrada. As fontes e os limites dessa conclusão estão em [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

Duas regressões falharam antes do ajuste final e passaram depois: perfis novos não selecionam Faber implicitamente, e o runner rejeita produção sem modelo de voz explícito antes de criar job. Configurações existentes foram preservadas. Escolher um arquivo continua não sendo prova de direitos comerciais. Não houve publicação, inferência paga, compra ou backup remoto.

## Reformulação da interface e assistente pessoal

O passe seguinte substituiu o hero decorativo por fluxo editorial e próxima ação, reorganizou tokens/componentes/layout e revisou a escrita das telas. `components.ts` concentra os controles compartilhados; `overview.ts` e `workflow.ts` separam apresentação e decisão por canal. A curadoria de skills está em [UI_SKILLS_SOURCES.md](UI_SKILLS_SOURCES.md); a direção visual, em [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

A interface foi inspecionada em desktop e 390 × 844: painel, editor, navegação móvel com estado ARIA, fechamento por Escape, configurações, acesso explícito ao editor pessoal e reprodução do vídeo já existente. O editor pessoal apareceu com limite de 20.000 caracteres sem copiar seu conteúdo para snapshots/documentação. O teste não alterou o prompt real, não conectou contas e não gerou nova mídia ou texto por LLM real.

O assistente sem Ollama pronto mostrou o motivo e manteve **Criar rascunho** desativado. Os testes com respostas simuladas comprovam regras do conector, incluindo seleção explícita de referências, identidade do canal/modelo, recusa de nuvem, schema e limite de stream com cancelamento. Eles não comprovam a qualidade ou resistência semântica de um LLM real. O prompt pessoal e o legado foram ignorados no Git; o legado saiu do índice mantendo a cópia local, sem reescrever commits anteriores.

Evidências locais ignoradas: `artifacts/ui-redesign-20261028/painel-desktop.jpg`, `painel-mobile.jpg`, `producao-desktop.jpg`, `configuracoes-desktop.jpg` e `revisao-video.jpg`, todos no mesmo diretório. Esses arquivos mostram exclusivamente o perfil de QA.

## Refinamento Impeccable

A revisão seguinte retirou a composição de cartões, reduziu ornamentos e adotou listas com miniaturas autenticadas da produção. Foram conferidos o acesso direto à revisão do vídeo, a abertura do roteiro correspondente, o detalhe financeiro por teclado, o menu móvel com Escape e o encerramento da sessão sintética. As larguras desktop, 760 px e 390 px não apresentaram overflow horizontal da página nas medições do DOM. A verificação final de console não retornou erros nem avisos.

Os mesmos 62 testes e o build passaram após as alterações. O detector estático Impeccable retornou `[]` nos oito arquivos de UI examinados; isso é uma checagem mecânica de fonte e não certifica estética ou acessibilidade completa. Origem, versão e execução constam em [UI_SKILLS_SOURCES.md](UI_SKILLS_SOURCES.md). As capturas finais estão em `artifacts/impeccable-20261028/desktop.jpg`, `mobile.jpg`, `editor.jpg` e `auth.jpg`; o resultado do detector, em `detector.json`. Todos são artefatos locais ignorados e usam apenas o perfil de QA.
