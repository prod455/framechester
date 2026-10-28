# Prontidão para uso local

Revisão de **28/10/2026**, Windows x86_64, Node 22.23.4. Foram aplicadas
`qa-test-strategy`, `ux-operator-workflow`, `dx-maintenance`,
`framechester-teams`, `ffmpeg-quality-gate` e as skills de marketing descritas
na [revisão de marketing e YouTube](REVISAO_MARKETING_LOCAL.md).

**Parecer: aprovado para um piloto local supervisionado**, com edição,
organização de canais, produção e revisão de arquivos. Continua sendo uma
entrega pré-alpha. A aprovação é para os cenários executados neste computador;
não aprova comercialmente uma voz, um vídeo, um canal ou a monetização.

## Problemas encontrados e corrigidos

| Problema reproduzido | Comportamento entregue | Evidência |
|---|---|---|
| Navegar descartava edição de roteiro sem aviso | Navegação, troca de roteiro/canal/escopo, atualização e saída pedem decisão quando há alterações. Fechamento e Escape de formulários também são protegidos | Reprodução anterior no navegador; testes de `EditSession`; repetição no navegador com texto, cena adicionada, Voltar, configurações e segundo canal |
| Fechar/recarregar a página podia perder trabalho sem aviso | Listener de saída usa o aviso nativo quando há alterações; não existe autosave de rascunhos em disco | Regra de estado coberta; a caixa nativa de recarregamento não foi exercitada nesta revisão |
| Entrega exit 0 sem QA utilizável ou vídeo aparecia como pronta para revisão | Estado bloqueado com diagnóstico, mesmo com saída bem-sucedida do processo | Regressões runner: QA ausente/desconhecido, vídeo ausente/vazio |
| Um check opcional não executado ocultava checks aprovados | Agregação coerente com o motor; estado desconhecido nunca aprova | Contratos runner/core |
| Falhas de início tinham mensagem genérica | Porta inválida, ocupada, permissões e armazenamento recebem instrução controlada sem imprimir erro privado bruto | Três regressões executam o entrypoint real; quarto caso verifica mensagens sanitizadas |
| Assistente forçava português em outro idioma de canal | Segue o idioma do canal, salvo pedido explícito no briefing | Regressão creative com canal sintético em inglês |
| Resultados somava centavos sem verificar overflow | Usa o mesmo totalizador seguro da visão geral, preservando rede, classe e moeda | Testes financeiros de overflow, moedas e desconhecidos; substituição do totalizador no frontend |

A proteção de edição usa apenas memória e valores dos formulários atuais.
Não grava rascunhos, senhas ou conteúdo de arquivos no armazenamento do
navegador. Campos ficam inertes durante o envio para evitar edições enquanto
o salvamento está pendente. Queda do processo, sessão encerrada ou fechamento
inesperado ainda podem perder trabalho não salvo; salvar continua necessário.

## Verificações e limites

| Capacidade | Resultado observado |
|---|---|
| Web | **72/72 testes**, sem falhas ou skips; TypeScript estrito e build Vite aprovados |
| Rust | **135 testes aprovados** na suíte normal; um teste de mídia ignorado por padrão foi executado separadamente e passou |
| Python | **51 testes aprovados** |
| Lint Rust | `cargo fmt --all --check` e Clippy com `-D warnings` aprovados |
| Dependências web | `npm --prefix web audit --audit-level=high`: zero vulnerabilidades reportadas na consulta; não constitui certificação de segurança |
| Doctor | FFmpeg, ffprobe, Piper, ASR e restic encontrados; dry-run e telemetria conferidos. Ausência de segredos opcionais permanece aviso. Encontrar uma ferramenta/modelo não valida licença |
| Autorização e isolamento | HTTP/auth/store/runner: sessão, CSRF, Host/Origin, separação de canal, Range e caminhos cobertos; cofre DPAPI exercitado com segredo sintético |
| Reinício | Regressão conserva histórico e mídia e bloqueia jobs interrompidos; sessões em memória exigem novo login |
| UX real | Login, edição/salvamento, proteção de formulários, troca de contexto, novo job e abertura do MP4. Confirmação de saída inspecionada em desktop e 390 × 844; sem overflow no diálogo móvel |
| Contas/IA reais | OAuth e geração real com LLM **não verificados**; contratos foram testados com fixtures. Não se acessou prompt pessoal |

Não foi feita instalação limpa em outra máquina, execução Linux, teste de carga
ou auditoria universal de segurança/acessibilidade. Usar uma instância por
perfil; o perfil privado precisa de backup. Não existe recuperação automática
de estado corrompido ou retomada de job interrompido implementada no Studio.

## Novo percurso audiovisual

Foi usado apenas o perfil sintético `artifacts/web-qa-20261027`, na porta
4318 e host de cookies separado do perfil do operador. Criou-se um segundo
canal de QA vazio para conferir que a troca não empresta roteiros do primeiro.
O título alterado para testar salvamento foi restaurado; edições de cena,
configuração e pautas não salvas foram descartadas explicitamente no teste.

O job `84ce9dbb-5705-4812-8ce6-c8e9340b9c11`, canal `studio-qa`, foi iniciado
no navegador com roteiro e quatro clipes originais já existentes:

- Estado final `needs_review`, **12 checks técnicos pass**, editorial com
  revisão humana pendente. Nenhuma publicação ou lançamento financeiro criado.
- MP4 H.264/AAC, **76,838354 s**, 360 × 640, 30 fps, estéreo 48 kHz,
  3.145.617 bytes. Metadados também lidos pelo navegador, sem erro de mídia.
- SHA-256: `8bb476d35ca7c539e84517bf212af0f10c86a8ba58dba4a3bbc441c0a6753b9d`.
- A voz do piloto é a Faber já configurada no perfil de QA. Isso comprova
  execução local, **não** permissão comercial da voz/base Lessac. A pendência
  permanece em [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

Capturas locais ignoradas estão em `artifacts/readiness-20261028/`:
`protecao-edicao.jpg`, `protecao-mobile.jpg` e `producao-revisao.jpg`.
O serviço do operador foi reiniciado com as correções após conferir zero jobs
ativos; os dados privados não foram alterados pela revisão.

## Condições para o primeiro uso

Siga [WEB_STUDIO.md](WEB_STUDIO.md) para iniciar, criar a senha e selecionar o
canal. Configure ferramentas/modelos locais e escolha voz/mídia com direitos
compatíveis com o uso pretendido. Salve os documentos antes de encerrar.
Produza e revise um episódio próprio antes de ampliar canais ou frequência.

Para receita real, ainda é preciso validar a identidade/OAuth e permissões da
conta, conferir elegibilidade na plataforma e resolver direitos/editorial da
peça. TikTok/Instagram/Facebook continuam sem receita automática integrada;
CTR, retenção, formatos e análise por vídeo ainda dependem do YouTube
Studio/exportação. A publicação web permanece desativada. O próximo piloto e
as fontes vigentes constam em [REVISAO_MARKETING_LOCAL.md](REVISAO_MARKETING_LOCAL.md).
