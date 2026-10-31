# Como subir o Framechester

Este manual leva você do zero ao Studio aberto no navegador. Escolha **um** jeito
de rodar: direto no computador ou no Docker. Os dois usam a porta 4317, então não
rode os dois ao mesmo tempo.

| Jeito | Para quem | O que precisa |
|---|---|---|
| [Direto no computador](#direto-no-computador) | Uso diário no Windows ou no Linux | Node.js, Rust, Python 3.12 e FFmpeg |
| [Docker](#no-docker) | Servidor, ou quem não quer instalar ferramentas | Docker Desktop ou Docker Engine |

Nos dois casos o Studio fica só no seu computador (`127.0.0.1`), nada é
publicado sem você e nenhuma chamada paga acontece ao iniciar.

## Direto no computador

### 1. Instale as ferramentas (uma vez)

No Windows, abra o PowerShell e rode:

```powershell
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Rustlang.Rustup
winget install -e --id Python.Python.3.12
winget install -e --id Gyan.FFmpeg
```

Feche e abra o PowerShell de novo, para ele enxergar o que foi instalado.

> **Python 3.12, não o mais novo.** A voz precisa do `onnxruntime`, que só tem
> pacote até o Python 3.14. Se você já tem o 3.15, pode deixar: instale o 3.12
> junto, e o Framechester usa o 3.12 sozinho.

### 2. Baixe o projeto e prepare (uma vez)

```powershell
git clone https://github.com/prod455/framechester.git
cd framechester
npm.cmd run setup
npm.cmd run voices:setup
```

`setup` instala as dependências, compila o motor e a interface. `voices:setup`
instala a voz (Kokoro) e baixa os modelos, conferindo cada arquivo.

### 3. Confira se está tudo certo

```powershell
.\target\release\framechester.exe doctor
```

`ffmpeg`, `ffprobe` e `commercial_voice` precisam aparecer como `[ok]`. Os
`[aviso]` de restic, Anthropic e YouTube são opcionais: backup, roteiro por API e
envio ao YouTube. Configure quando for usar.

### 4. Suba o Studio

```powershell
npm.cmd start
```

Abra `http://127.0.0.1:4317`. Na primeira vez, crie a senha local (12 caracteres
ou mais) e o canal. A tela inicial é **Criar vídeo**.

Para parar, use `Ctrl+C` no terminal ou rode `npm.cmd stop`.

### Para atualizar

```powershell
git pull origin main
npm.cmd start
```

O `start` recompila o que mudou (dependências, motor e interface) antes de subir.
Depois, aperte `Ctrl+F5` no navegador para não usar a tela guardada em cache.

## No Docker

### 1. Instale o Docker (uma vez)

- **Windows:** instale o [Docker Desktop](https://docs.docker.com/desktop/) e
  deixe-o aberto, em modo de contêineres Linux.
- **Linux:** instale o Docker Engine com o plugin Compose.

Você também precisa do Node.js 22.12 ou mais novo e de qualquer Python 3.11 ou
mais novo, só para preparar os arquivos.

### 2. Prepare a voz e a chave (uma vez)

```powershell
git clone https://github.com/prod455/framechester.git
cd framechester
npm.cmd run voices:models
npm.cmd run docker:prepare
```

`voices:models` baixa os modelos de voz para `models/`, que o contêiner lê sem
alterar. `docker:prepare` cria a chave que protege as credenciais do Studio. Ela
fica fora do repositório; guarde uma cópia, porque sem ela as credenciais salvas
não abrem.

### 3. Suba

```powershell
npm.cmd run docker:up
```

A primeira vez compila o motor e a interface dentro da imagem e leva alguns
minutos. As próximas reaproveitam o cache. Quando terminar, abra
`http://127.0.0.1:4317`.

### Comandos do dia a dia

| Para | Rode |
|---|---|
| Ver se está de pé | `npm.cmd run docker:status` |
| Ver os logs | `npm.cmd run docker:logs` |
| Parar | `npm.cmd run docker:down` |
| Atualizar | `git pull origin main` e depois `npm.cmd run docker:up` |

`docker:down` para o Studio e **mantém** vídeos, canais, senha e chave. Não use
`docker compose down -v`, `docker volume rm` nem `docker system prune` para parar:
eles apagam os dados.

Onde ficam as coisas:

| O quê | Onde |
|---|---|
| Canais, roteiros, vídeos e credenciais protegidas | volume `framechester_studio-data` (`/data` no contêiner) |
| Cache de narração | dentro do mesmo volume, em `/data/studio/production/engine` |
| Modelos de voz | `models/` no seu computador, montado só para leitura |
| Chave das credenciais | fora do repositório; o caminho está em `.framechester/docker/compose.env` |

## Se algo der errado

| Você vê | O que fazer |
|---|---|
| `npm.ps1 não pode ser carregado porque a execução de scripts foi desabilitada` | Use `npm.cmd` no lugar de `npm`, ou libere scripts para o seu usuário: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `Instale Python 3.11–3.13 para o narrador local` | Instale o Python 3.12 junto do que você já tem (passo 1) e rode `npm.cmd run voices:setup` de novo |
| `No Python at '...python.exe'` | O Python que criou o ambiente da voz mudou de lugar. Rode `npm.cmd run voices:setup`: ele recria o ambiente sozinho |
| `falha ao executar ffmpeg: program not found` | Instale o FFmpeg (passo 1), feche e abra o terminal, e confira com `ffmpeg -version` |
| `O motor Rust está desatualizado` ou erro de argumento do motor | Pare o Studio e suba com `npm.cmd start`, que recompila o motor |
| A tela continua igual depois de atualizar | Suba com `npm.cmd start` (ele recompila a interface) e aperte `Ctrl+F5` |
| `A porta local já está em uso` | Outro Studio está aberto. Pare-o com `npm.cmd stop` (ou `npm.cmd run docker:down`), ou escolha outra porta com `FRAMECHESTER_WEB_PORT` |
| `Inicie o Docker Desktop/Engine antes de subir` | Abra o Docker Desktop, espere ficar verde e rode `npm.cmd run docker:up` de novo |
| `Execute npm run docker:prepare antes deste comando` | Rode `npm.cmd run docker:prepare` uma vez |
| `Read-only file system` numa produção no Docker | Você está numa versão anterior à correção do cache de narração. Atualize (`git pull origin main`) e suba de novo |

Para detalhes de segurança, rede e entrega da imagem, veja [DOCKER.md](DOCKER.md).
Para usar o Studio depois de subir, veja [WEB_STUDIO.md](WEB_STUDIO.md).
