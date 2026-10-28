# Subir, parar e operar o Framechester

O Studio pode rodar nativamente no Windows ou em Docker Desktop/Engine com
Compose. Use uma modalidade por vez na porta 4317. A publicação nas redes
continua desativada e nenhuma chamada paga é feita ao iniciar.

## Uso cotidiano

Na raiz do projeto, com Docker Desktop aberto:

```powershell
npm run docker:up
```

Abra `http://127.0.0.1:4317`. O comando prepara o segredo de criptografia,
constrói a imagem se necessário, inicia em segundo plano e aguarda o healthcheck.
A primeira construção baixa ferramentas e compila Rust/TypeScript; as próximas
reutilizam o cache. Os logs e o estado ficam disponíveis por comandos separados:

```powershell
npm run docker:status
npm run docker:logs
npm run docker:down
```

`docker:down` preserva dados e chave. Não use `down -v`, `volume rm` ou `prune`
como procedimento de parada. `npm stop` encerra os processos nativos identificados
por esta pasta e para o Compose deste projeto, quando preparado. Outros projetos,
processos Node genéricos e os processos do Codex não são alvos desse comando.

O uso nativo continua disponível:

```powershell
npm run setup
npm start
```

`setup` instala dependências web, constrói o motor Rust e compila a interface.
Não é necessário repeti-lo a cada abertura. `npm run dev` inicia o backend em
watch e Vite; `npm stop` encerra os processos do projeto. Durante uma produção,
parar o servidor interrompe o trabalho; o histórico registra a interrupção.

## Docker direto para DevOps

Requisitos: Docker Desktop em modo de contêineres Linux ou Docker Engine com
Compose, acesso ao daemon e recursos para construir Rust/instalar ferramentas.
O launcher exige Node.js 22.12+; o fluxo Compose direto não exige Node no host
quando a chave externa já foi provisionada.

Com o launcher, prepare os arquivos locais uma vez e valide o Compose:

```powershell
npm run docker:prepare
npm run docker:config
npm run docker:doctor
docker compose --env-file .framechester/docker/compose.env up -d --build --wait
```

O shell aberto antes da instalação do Docker pode precisar ser reaberto para
encontrar `docker`. Os comandos `npm run docker:*` localizam também o executável
nas instalações padrão do Docker Desktop por usuário ou por máquina.

Para provisionamento sem o launcher, forneça `FRAMECHESTER_DOCKER_VAULT_KEY_FILE`
com caminho absoluto de um arquivo privado contendo uma chave aleatória de 32
bytes codificada em 64 caracteres hexadecimais, opcionalmente com uma quebra de
linha final. Use gerador criptográfico, mantenha o arquivo fora do repositório
e restrinja o acesso no host. Nunca coloque seu conteúdo em variável de ambiente,
Dockerfile, argumento de build ou arquivo Compose.

No PowerShell, as opções não secretas podem ser definidas antes de subir:

```powershell
$env:FRAMECHESTER_HTTP_PORT = '4318'
$env:FRAMECHESTER_MEMORY_LIMIT = '4g'
$env:FRAMECHESTER_CPUS = '2.0'
npm run docker:up
```

| Opção | Padrão / função |
|---|---|
| `FRAMECHESTER_HTTP_PORT` | `4317`; publicada exclusivamente em `127.0.0.1` |
| `FRAMECHESTER_IMAGE` | `framechester-studio:local`; permite selecionar imagem anterior |
| `FRAMECHESTER_MODELS_DIR` | `./models`; diretório existente montado somente para leitura |
| `FRAMECHESTER_MEMORY_LIMIT` | `4g`; memória máxima do serviço |
| `FRAMECHESTER_CPUS` | `2.0`; limite de CPU do serviço |
| `FRAMECHESTER_DOCKER_VAULT_KEY_FILE` | Arquivo externo fornecido ao Compose como secret |

Os limites do serviço não controlam os recursos do builder do Docker. O arquivo
`.framechester/docker/compose.env` gerado pelo launcher guarda somente o caminho
da chave; configure outras opções no ambiente ou em seu próprio env file privado.

## Dados, identidade e segredos

O projeto Compose chama-se `framechester`, o serviço é `studio` e o volume
`studio-data` é montado em `/data`. Uma instalação Docker usa um **perfil próprio**:
ela não apaga, monta, migra ou converte o perfil Windows existente.

| Local no contêiner | Conteúdo |
|---|---|
| `/data/studio` | Senha local, canais, editores, produção e histórico de consumo |
| `/data/studio/vault` | Credenciais criptografadas por canal e slot |
| `/data/private/.framechester` | Preferências de IA e prompt pessoal |
| `/run/secrets/vault_key` | Chave externa montada para leitura, fora da imagem/volume de dados |
| `/models` | Modelos escolhidos pelo operador, montados para leitura |

Por padrão, o launcher cria a chave em
`%USERPROFILE%\.framechester\docker-secrets\framechester.key` no Windows ou
`~/.framechester/docker-secrets/framechester.key` no Linux. Ela é persistente:
subir novamente não gera outra chave por cima. Chaves customizadas ausentes,
malformadas ou com vínculos inseguros são recusadas.

O cofre Docker usa AES-256-GCM, nonce novo e autenticação de canal/slot/versão.
O cofre nativo Windows continua usando DPAPI. Sem a chave correta, não há
fallback em texto puro nem sobrescrita das credenciais existentes. No Linux,
arquivo de chave gravável por grupo/outros é recusado; a exceção para mounts
read-only do Docker Desktop exige que uma tentativa de abertura sem escrita
retorne `EROFS`. `EACCES` não é aceito como prova de mount read-only.

Mantenha backup privado do volume **e** da chave externa. O volume sozinho não
recupera as credenciais. Recriar a imagem ou executar `down` não constitui backup.
Para copiar dados nativos para Docker, faça uma migração deliberada e reconecte
as contas: ciphertext DPAPI não é portátil para o cofre Linux.

## Voz, mídia e ferramentas

A imagem inclui Node, motor Rust compilado, FFmpeg/ffprobe, fontes DejaVu e
Piper 1.8.0. Não inclui pesos de voz, modelos ASR, mídias do operador ou seus
prompts. Os pacotes Python têm versões e hashes fixados; Node/Cargo usam lockfiles.

Coloque a voz autorizada e seu arquivo de configuração no diretório de modelos
do host. Dentro do Studio Docker, use o executável `/opt/piper/bin/piper` e o
caminho `/models/nome-da-voz.onnx`. O arquivo `.onnx.json` correspondente deve
estar junto. Caminhos `C:\...` do perfil nativo não funcionam dentro do contêiner.
Escolha uma voz com permissões compatíveis; a imagem não resolve a pendência
comercial da voz Faber usada no piloto.

ASR/Whisper e GPU não são incluídos nem habilitados por presunção. Ative ASR
somente com o executável/modelo apropriados disponíveis. Ollama dentro do
contêiner não aponta para o serviço do Windows: o conector local atual usa
`127.0.0.1` e exige comprovação de execução local. Para o assistente Docker desta
entrega, use as integrações OpenAI/Anthropic ou os editores manuais.

Os componentes têm licenças próprias, incluindo Piper GPL-3.0-or-later.
[Avisos da imagem](../docker/THIRD_PARTY.md) distinguem essas ferramentas do
código Apache-2.0 do projeto e dos pesos de voz não distribuídos.

## Rede, saúde e entrega

O processo nativo continua em loopback. Dentro de um contêiner detectado e
explicitamente habilitado, o backend escuta em `0.0.0.0`; o Compose publica
somente `127.0.0.1:porta`. Host/Origin, autenticação e CSRF permanecem ativos.
A porta externa também é usada na URL de callback OAuth do YouTube.

`GET /healthz` devolve apenas `{"status":"ok"}`, sem sessão, identidade, chave ou
dados de canal. Isso comprova o processo HTTP disponível, não autorização em
provedores ou aprovação editorial de um vídeo. O serviço roda como UID/GID
1000, com root filesystem read-only, `/tmp` temporário, capabilities removidas,
`no-new-privileges`, limites de recursos e logs com rotação.

O contexto de build é fechado por padrão e exclui dados privados, `.env`,
credenciais, modelos e mídia, inclusive dentro de diretórios de código permitidos.
A CI constrói localmente, verifica o serviço com dados sintéticos e testa
persistência depois de recriar. Não publica imagem, release ou vídeo.

Para atualizar, execute `npm run docker:up` após revisar a mudança. Antes de
atualizar, preserve volume e chave em backup privado. Para voltar a uma imagem
anterior, selecione a tag com `FRAMECHESTER_IMAGE` e execute Compose
`up -d --no-build --wait`; valide a compatibilidade do formato de dados antes
de reutilizar um volume modificado por uma versão mais nova.

As validações executadas e seus limites estão em [INFRA_VALIDACAO.md](INFRA_VALIDACAO.md).
