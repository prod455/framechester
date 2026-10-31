# Política de segurança

## Como relatar uma vulnerabilidade

Relate em particular pelo [relato privado de vulnerabilidades do GitHub](https://github.com/prod455/framechester/security/advisories/new). Não abra uma issue pública e não inclua no relato tokens, identificadores de conta, mídia privada ou dados de uma instalação real.

Informe a versão (tag ou commit), o componente (Studio web, motor Rust, imagem Docker, scripts), os passos para reproduzir e o impacto observado. Você recebe uma confirmação em até 7 dias e uma atualização de status em até 30 dias. As correções saem em uma versão de patch, com uma nota no `CHANGELOG.md`; o crédito é dado se você quiser.

## Versões com suporte

| Versão | Suporte |
|---|---|
| versão `0.x` mais recente | correções de segurança |
| versões anteriores | atualize para a versão mais recente |

O Framechester ainda não chegou à 1.0: mudanças incompatíveis podem acontecer entre versões minor e ficam listadas no changelog.

## Escopo

O Framechester roda no computador do próprio operador. O modelo de segurança parte destas premissas:

- O Studio escuta só em loopback, protegido por uma senha local, com proteção CSRF e um cofre por instalação para os tokens. Expor o Studio a uma rede não é suportado.
- Publicação, compras e gastos com backup ficam desativados, a menos que o operador os ative explicitamente; `dry_run` é o padrão.
- A telemetria fica desligada. Nenhum dado sai do computador, exceto as chamadas que o operador configura (provedores de LLM, busca de fontes no Crossref, APIs das plataformas com as credenciais do próprio operador).
- A mídia que o operador importa é conferida quanto a tipo, tamanho e integridade; subprocessos (FFmpeg, Kokoro, restic) são chamados com argumentos explícitos, nunca por um shell.

Dentro do escopo: qualquer coisa que quebre essas premissas, como desvios de autenticação ou de CSRF, segredos vazando para logs, relatórios ou o frontend, path traversal em uploads ou arquivos de produção, server-side request forgery na busca de fontes ou de mídia, injeção de comandos nas chamadas de subprocessos e problemas de cadeia de suprimentos nas dependências fixadas ou nos downloads de modelos.

Fora do escopo: vulnerabilidades que exigem acesso físico ao computador do operador ou uma instalação modificada, e problemas em serviços de terceiros que o operador conecta.

## Checklist de proteção para operadores

- Mantenha o Studio em `127.0.0.1` (o padrão) e use a senha local.
- Mantenha a chave do cofre fora do repositório e faça backup do diretório de dados com a criptografia do restic.
- Rode `cargo run -p framechester-cli -- doctor` depois de atualizar; ele mostra as versões do FFmpeg, do Python e dos modelos de voz.
- Revise o `pipeline_report.json` antes de publicar qualquer coisa manualmente.
