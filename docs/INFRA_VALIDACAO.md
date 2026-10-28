# Validação da infraestrutura — 28/10/2026

Implementação e testes no Windows, com Docker Desktop recém-instalado pelo
operador. A validação final utilizou Docker Engine 29.9.2 e Compose 5.6.1.
Não foram utilizadas credenciais reais nem chamadas pagas ou publicação.

## Resultado executado

| Contrato | Evidência |
|---|---|
| Subida nativa simples | `npm start` na raiz iniciou o Studio; `/healthz` retornou `ok` |
| Parada por identidade do projeto | `npm stop` encerrou os dois processos do Studio; portas liberadas |
| Proteção da chave externa | `docker:prepare` real concluiu; ACL do arquivo protegida com uma regra do usuário atual |
| Docker recém-instalado sem reabrir shell | Executável localizado na instalação por usuário; helpers receberam PATH correto |
| Build real | Imagem local construída com Rust release, backend ESM, frontend, FFmpeg e Piper |
| Comando único | `npm run docker:up` construiu com cache e aguardou estado saudável em 4317 |
| Rede e runtime | Inspeção: usuário `1000:1000`, rootfs read-only, privileged=false, publicação `127.0.0.1:4317` |
| Autenticação e cofre reais no contêiner | Smoke em projeto Compose separado criou somente senha/canal/chave sintéticos; configuração e chave salvas sem texto puro |
| Ferramentas do contêiner | Rust/FFmpeg/ffprobe/Piper executados; FFmpeg produziu H.264 com texto e fonte |
| Persistência | Contêiner de QA removido e recriado sem apagar volume; login, canal, preferências e cofre foram recuperados |
| Encerramento final | `npm stop` parou o Compose principal preservando seu volume; QA separado foi limpo depois de verificar sua identidade |

O Docker usa dados próprios. Nenhum estado, mídia, prompt pessoal ou credencial
do perfil nativo foi migrado ou substituído. O volume principal e sua chave foram
preservados. Apenas o volume novo de QA, contendo dados sintéticos criados nesta
validação, foi removido ao final. Os serviços do Engine adicional instalado no
Ubuntu/WSL durante a preparação foram desativados; a validação utilizou o Docker
Desktop do operador.

## Testes

- **Web:** 174 testes, 172 aprovados e 2 ignorados por condição de plataforma/opt-in;
  TypeScript e build aprovados.
- **Lifecycle:** 12 testes Node aprovados no Windows, incluindo ACL real, proteção
  repetida, array de múltiplos PIDs no PowerShell 5, identidade de processo e PATH.
- **Python:** 55 testes aprovados, incluindo 4 contratos novos de distribuição Docker.
- **Cofre Linux:** 6 testes aprovados no WSL; integração adicional real em Docker
  confirmou secret Windows read-only com bits de escrita e recusa por `EROFS`.
- **Container:** smoke HTTP/auth/cofre, ferramentas/render e persistência executados
  com sucesso no Docker Desktop. CI adicionada para repetir esse percurso sem push.

## Regressões encontradas e corrigidas

O teste real no Windows revelou que proteger a chave por PowerShell `-Command`
não era confiável. A proteção passou a um helper estático que altera somente a
DACL, conserva o proprietário e limita acesso ao usuário atual. Chave existente
também é protegida: falha anterior não permite pular a etapa.

O PowerShell 5 entregava a lista de PIDs como array aninhado, impedindo `npm stop`.
A conversão foi corrigida e ganhou um teste com inventário sintético, sem matar
PIDs de teste. A parada real foi repetida e passou. O seletor também conserva a
distinção entre maiúsculas e minúsculas dos caminhos POSIX.

O CLI do Docker recém-instalado estava fora do PATH do shell e seu helper de
credenciais também não era localizado. O launcher encontra os caminhos padrão e
inclui a pasta do executável somente no ambiente dos processos filhos.

O backend recebeu modo de contêiner explícito, chave externa, caminhos próprios,
porta pública validada e endpoint mínimo de saúde. O modo nativo segue em loopback;
Host/Origin e autenticação/CSRF continuam exigidos. A porta publicada é utilizada
também no callback OAuth, sem aceitar URLs arbitrárias da requisição.

## Limites

Nenhuma voz foi baixada nem foi realizada síntese com modelo de voz real nesta
validação. A licença e o arquivo de voz continuam sendo escolhas do operador.
ASR, GPU, Ollama no host, contas sociais e inferência paga não foram habilitados
ou certificados pela construção da imagem. O build fixa versões e lockfiles,
mas os pacotes apt e as tags de imagem continuam sujeitos à disponibilidade dos
registros; não é uma reprodução binária baseada em snapshots imutáveis.

O guia operacional está em [DOCKER.md](DOCKER.md). Os caminhos de atualização e
rollback preservam volume e chave; não foi simulada migração para uma versão
antiga com formato de dados incompatível.
