# Vozes permitidas na produção

Revisão: 28/10/2026. A produção está restrita às vozes brasileiras do
**Kokoro-82M v1.0**, publicado pelo autor sob **Apache-2.0**, que permite uso
comercial conforme as condições da licença.

| Voz | ID | Idioma |
|---|---|---|
| Dora | `pf_dora` | Português brasileiro |
| Alex | `pm_alex` | Português brasileiro |
| Santa | `pm_santa` | Português brasileiro |

## Instalação

Nativo, com Python 3.11–3.13 instalado:

```powershell
npm run voices:setup
npm run setup
npm start
```

Docker, com Python 3.11+ disponível apenas para o download no host:

```powershell
npm run voices:models
npm run docker:up
```

O comando de instalação nativa cria `.framechester/tts-venv` com dependências
e hashes fixados em `docker/tts-requirements.txt`. Os dois comandos de vozes
baixam apenas os arquivos conhecidos para `models/kokoro/`, fora do Git e da
imagem. Não usam API paga. As próximas narrações funcionam sem rede.

No Studio, selecione a voz em **Configurações → Voz & narração local**.
Instalações anteriores do Piper migram para Dora; a migração conserva canal,
roteiros e configuração de render. Não apaga os antigos arquivos de modelos.

## Arquivos aceitos

Origem fixa: [release model-files-v1.1 do exportador Kokoro ONNX](https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.1).

| Arquivo | Bytes | SHA-256 |
|---|---:|---|
| `kokoro-v1.0.onnx` | 325505369 | `beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a` |
| `voices-v1.0.bin` | 28214398 | `bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d` |

O Studio recusa vozes fora da lista antes de criar um trabalho. O motor Rust
confere os arquivos pelo helper incorporado ao binário e repete a conferência
antes de sintetizar cada cena. Alterar nome ou declarar um arquivo como
“comercial” não concede aprovação. Não há fallback para Piper, variáveis de
ambiente de voz ou modelos arbitrários. `--voice` na CLI segue a mesma lista.

## Licenças e evidências

- [Modelo original Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), revisão consultada `f3ff3571791e39611d31c381e3a41a3af07b4987`: pesos Apache-2.0 e autorização de implantação comercial declarada pelo autor.
- [Lista oficial de vozes](https://huggingface.co/hexgrad/Kokoro-82M/blob/f3ff3571791e39611d31c381e3a41a3af07b4987/VOICES.md): inclui os três IDs brasileiros.
- [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx): wrapper MIT; versão instalada 0.6.1. `phonemizer` e eSpeak NG mantêm GPL-3.0-or-later; ONNX Runtime mantém MIT.
- Licença e atribuição do modelo são fornecidas em `docker/licenses/` e copiadas junto aos downloads. Se redistribuir pesos ou runtime, preserve os avisos e cumpra as condições de cada componente.

Faber, Cadu e Jeff permanecem bloqueadas nesta operação porque suas fichas
declaram base Lessac, cuja cadeia comercial segue pendente. Edresson também
fica bloqueada: sua [ficha](https://huggingface.co/rhasspy/piper-voices/blob/main/pt/pt_BR/edresson/low/MODEL_CARD)
declara base Ryan low, cuja [ficha](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ryan/low/MODEL_CARD)
identifica dataset CC BY-NC-SA 4.0. Não se presume que a licença do dataset
final resolva permissões do checkpoint anterior.

## Validação

Foram reproduzidas as falhas do fallback antigo e da produção com voz não
revisada antes da correção. Os testes cobrem bloqueio no Studio e nos
adaptadores, migração, arquivos renomeados e conteúdo substituído mantendo
o mesmo tamanho. As três vozes geraram WAVs locais a 24 kHz com o modelo
oficial; as amostras sintéticas ficam somente em `artifacts/voice-research/`.


No Docker Desktop, o smoke `docker/verify-voices.py` também gerou e decodificou
WAV/MP4 das três vozes pelo motor Rust, sem rede, com UID 1000, raiz somente
leitura, modelos somente leitura e `/tmp` noexec. Vozes legadas e IDs
desconhecidos falharam antes do render. O `phonemizer` usa um cache privado
em `/data/tts-tmp` para sua cópia temporária da biblioteca; a raiz e `/tmp`
conservam as proteções. A coleta do ONNX Runtime é desativada explicitamente
antes da inferência. Esse smoke faz parte do CI.

O piloto de uma cena é uma fixture técnica e permanece bloqueado pelo QA
editorial; gerar áudio/vídeo nesse teste não aprova uma peça para publicação.
A imagem validada foi etiquetada localmente como `framechester-studio:local`.
Não houve publicação, uso de chave real ou chamada paga.
