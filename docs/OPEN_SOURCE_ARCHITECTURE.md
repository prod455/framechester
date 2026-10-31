# Framechester — contrato de arquitetura open-source

Atualização do operador (2026-10-27): vários canais sob um único operador local substituem a premissa anterior de canal único. `ChannelProfile` identifica os canais locais; a seleção explícita delimita as saídas, relatórios e pacotes do pipeline. Os caminhos OAuth e a identidade esperada são por canal; o analytics local valida o canal e a janela do relatório. Isso não é autenticação de vários usuários. Veja `EQUIPES_E_SKILLS.md` e `AUDITORIA_ENGENHARIA.md` para responsabilidades e limites atuais.

## Topologia de implantação

1. Worker local (MVP): CLI Rust + binário externo do FFmpeg + TTS Kokoro (catálogo comercial PT-BR revisado; veja VOZES_COMERCIAIS.md); gera roteiro, narração, vídeo e QA. Nenhuma VPS é necessária (decisão `NOT_REQUIRED`).
2. VPS opcional no futuro: agendador, PostgreSQL, painel e fila de workers autenticada, só se for preciso orquestrar várias produções.
3. Armazenamento de objetos: backup criptografado com restic em um provedor compatível com S3; endpoint e chaves pertencem ao operador (opt-in, desativado por padrão).
4. Adaptadores de plataforma: APIs oficiais quando permitido. O publisher atual é só dry-run; o fluxo é manual/exportação até que um adaptador real seja autorizado e implementado.

Nenhum backend compartilhado, coleta centralizada de analytics ou conta remota controlada pelos mantenedores é necessária.

## Traits/contratos Rust (implementados em `framechester-core::ports`)

- `TrendSource`: `fetch(since, region) -> signals` (inclui datas e procedência)
- `FactEvidenceProvider`: `verify(claims) -> evidence` (o que é desconhecido precisa continuar desconhecido)
- `LlmProvider`: `generate(prompt, budget) -> structured_script`
- `TtsEngine`: `synthesize(script, voice) -> audio_with_metadata`
- `AssetProvider`: `resolve(scene) -> licensed_asset_manifest`
- `Renderer`: `render(timeline, assets, profile) -> validated_mp4`; opcional `thumbnail(title, output) -> png`
- Pacote de publicação: legendas SRT, descrição, JSON de metadados e markdown de fontes/licenças são gerados a partir do roteiro, da timeline e dos relatórios de QA antes de qualquer chamada de publicação.
- Relatório local do operador: `report.html` mostra QA, geração do vídeo, links do pacote e avisos, sem assets externos nem chamadas de rede.
- As legendas queimadas opcionais usam um SRT local com libass; o caminho padrão continua só copiando o stream, pela velocidade.
- `Publisher`: `publish(media, account, policy) -> provider_result` (permissão explícita da conta)
- `MetricsProvider`: `fetch(video_ids) -> raw_metrics` (qualificadores específicos de cada plataforma)
- `BackupProvider`: `snapshot/restore/check` com armazenamento criptografado e log de auditoria.

Todo adaptador declara suas capacidades, termos de API, licença, necessidade de rede externa, custo unitário, segredos exigidos, conteúdo suportado e modos de falha. Por padrão, os plugins são **registrados e compilados**; não execute binários ou scripts de plugins não confiáveis sem um sandbox de verdade.

## Contratos e limites

- `configs/` e `.env` são locais/privados; `.env.example` é sanitizado.
- Cada instalação local tem seus próprios clientes e contas OAuth; os arquivos de release nunca incluem tokens OAuth dos mantenedores.
- Nenhuma telemetria ou comunicação com servidor por padrão. Nenhum scraping que viole os termos de uso nem pedido de dados sem consentimento.
- Nada de engajamento fictício, testes fabricados, anúncios, seguidores ou compras.
- Todo asset registra checksum, procedência, licença, URL quando houver, momento da obtenção e restrições de uso.
- Os relatórios financeiros separam a receita efetivamente recebida, a pendente, as projeções de modelo e os gastos extras em dinheiro.

## Travas de release e conformidade

`license-scan -> secret-scan -> fmt/lint -> unit/integration -> render QA -> safe install smoke -> vulnerability review -> maintainer approval -> publish`.

O FFmpeg pode ser LGPL ou GPL, conforme a configuração. Chamar como subprocesso limita o acoplamento, mas **não dispensa as obrigações de redistribuição** quando se distribuem binários do FFmpeg. Nunca inclua pesos de modelos pré-treinados ou imagens de vídeo com licença incerta.
