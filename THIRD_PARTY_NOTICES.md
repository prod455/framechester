# Registro de licenças e assets de terceiros (revise antes de cada release)

| Componente | Versão/origem | Uso | Situação da licença | Redistribuir? |
|---|---|---|---|---|
| FFmpeg / ffprobe | 9.0.1-full_build (gyan.dev/MSYS2) | renderizador externo e QA | LGPL-2.1+ por padrão; este build ativa componentes GPL (libx264, libx265). Registre o binário e a configuração a cada release. | Não incluir até verificar |
| libx264 | dentro do build do FFmpeg | codificação H.264 na CPU | GPL-2.0+ (por causa do x264) | Igual ao build do FFmpeg |
| h264_amf | dentro do build do FFmpeg | codificação na GPU AMD (prévia/candidato) | Segue o build do FFmpeg; valem os termos do driver em runtime | Não incluir |
| libvmaf | dentro do build do FFmpeg | medição de qualidade | BSD-2-Clause + questões de patente | Igual ao build do FFmpeg |
| Kokoro-82M v1.0 | hexgrad/Kokoro-82M; export ONNX model-files-v1.1 | narração PT-BR com Dora, Alex e Santa | Apache-2.0; hashes fixados do modelo e das vozes no [registro de vozes comerciais](docs/VOZES_COMERCIAIS.md) | Baixado à parte; licença e atribuição acompanham os arquivos locais |
| kokoro-onnx | 0.6.1 | Wrapper de inferência local | MIT; aviso em docker/licenses | Runtime incluído no build Docker local |
| `pt_BR-faber-medium.onnx` | `rhasspy/piper-voices` `pt/pt_BR/faber/medium`; 63,201,294 B; SHA-256 `858555E3A064209C57088FE6BD70C4C3DC54D03EAA00C45D5ECAF43A33F95AA7` | Voz piloto local | Dataset Faber CC0, mas a origem do checkpoint Lessac tem materiais-fonte só para pesquisa. A autorização comercial deste ONNX não está estabelecida; veja a evidência abaixo. | Não incluído; não trate como liberado para uso comercial |
| `pt_BR-faber-medium.onnx.json` | mesmo diretório da voz Piper | configuração da voz | Igual ao modelo de voz | Não incluído |
| whisper.cpp + `ggml-base.bin` | local `C:/whisper`; 147,951,465 B; SHA-256 `60ED5BC3DD14EEA856493D334349B405782DDCAF0028D4B5DF4088345FBA2EFE` | QA ASR PT-BR opcional | whisper.cpp MIT; pesos base do OpenAI Whisper MIT | Não incluído |
| restic | 0.19.1 | backup/restauração criptografados | BSD-2-Clause | O usuário instala à parte |
| Crates Rust | veja `Cargo.lock` | build/runtime | Permissivas mistas (MIT/Apache-2.0/BSD/ISC); rode `cargo deny`/varredura de licenças antes do release | Depois da varredura |
| Blender | opcional, não usado nesta etapa | futuro subprocesso 3D | Termos GPL para o software; avalie a inclusão à parte | Instalação externa |
| Inter (Regular, SemiBold, Bold) | rsms/inter 3.19 OTF, copiada do pacote Debian `fonts-inter`; SHA-256 registrado pelo `framechester-motion` em todo `render_manifest.json` | fonte de texto incluída no motor motion (`assets/fonts/inter`, embutida com `include_bytes!`) | SIL OFL-1.1 (`assets/fonts/inter/LICENSE-OFL-1.1.txt`); vale a regra do nome de fonte reservado | Sim, com o arquivo de licença |
| Liberation Mono (Regular, Bold) | Debian `fonts-liberation` 1.07 | fonte monoespaçada incluída para demonstrações de código (`assets/fonts/liberation`) | SIL OFL-1.1 (`assets/fonts/liberation/LICENSE-OFL-1.1.txt`) | Sim, com o arquivo de licença |
| Imagens, vídeo, música, fontes tipográficas (outras) | fornecidos pelo operador ou sintéticos | conteúdo dos vídeos | Direitos e procedência individuais por asset | Nunca distribua assets com direitos incertos |

Este arquivo é um **checklist de release**, não uma auditoria jurídica concluída. Rode de novo a varredura de dependências e licenças contra o lockfile real e o build do FFmpeg antes de qualquer release ou distribuição de binários.

## Voz piloto: autorização comercial não resolvida

Fontes primárias conferidas em **2026-10-28**: o [model card do Faber medium](https://huggingface.co/rhasspy/piper-voices/blob/main/pt/pt_BR/faber/medium/MODEL_CARD) declara o próprio dataset como CC0 e diz que ele foi ajustado (finetuned) a partir do Lessac medium. O [model card do Lessac medium](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/medium/MODEL_CARD) diz que ele foi treinado do zero e aponta para a [licença dos materiais-fonte do Blizzard 2013](https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html). As cláusulas 1.1 e 3.2 restringem esses materiais à pesquisa e excluem fins comerciais.

Isso estabelece uma cadeia de licenciamento não resolvida, não uma conclusão jurídica automática de que os termos do dataset se aplicam a todo peso derivado ou som gerado. O rótulo MIT do repositório inteiro e a declaração CC0 do dataset final não resolvem a autorização deste ONNX específico. Obtenha esclarecimento sobre a cadeia de pesos/checkpoints ou escolha uma voz com permissões comerciais documentadas antes de monetizar. Nenhum pedido de permissão foi enviado a terceiros.

As vozes Piper agora ficam bloqueadas pelo adaptador de produção. As configurações de voz antigas do Studio migram para a Kokoro Dora, mantendo a identidade do canal e as configurações de geração do vídeo. Só o modelo Kokoro revisado, o pacote de vozes e os IDs de voz PT-BR são aceitos; veja [VOZES_COMERCIAIS.md](docs/VOZES_COMERCIAIS.md). O piloto antigo continua como evidência técnica histórica, não como aprovação comercial.

## Dependências web do Framechester Studio

O renderizador local de visuais explicativos usa o `resvg` **0.49.0** e o grafo de
dependências `usvg`/`tiny-skia` travado no lockfile. Os metadados dos crates
instalados declaram MIT OR Apache-2.0 para resvg/usvg e BSD-3-Clause para
tiny-skia/tiny-skia-path 0.12.0; os pacotes transitivos exatos estão no `Cargo.lock`.
São dependências de runtime em Rust, sem CDN de navegador nem serviço remoto de
imagens. Revise o lockfile completo e mantenha os avisos aplicáveis ao distribuir um
binário. As fontes do sistema são carregadas da instalação; arquivos de fonte do
Windows não são copiados para o repositório nem redistribuídos por esta
funcionalidade. A imagem Docker usa o pacote de fontes DejaVu que já tem e os
avisos da distribuição.

A migração para o Basecoat adiciona o `basecoat-css` **1.1.0** (MIT) como dependência
direta de interface, com `tailwindcss` e `@tailwindcss/vite` **4.3.1** como
dependências só de build. Os estilos do Basecoat são compilados em assets locais;
o Studio não carrega autoloader de componentes, CDN nem fontes remotas. Os avisos
MIT do Basecoat (Copyright 2025 Ronan Berder) e do Tailwind ficam preservados em
`web/public/licenses/` e são copiados para `web/dist/licenses/` pelo Vite. O
lockfile registra os pacotes exatos. O `happy-dom` **21.0.4** (MIT) é uma dependência
só de desenvolvimento/testes, para os contratos de componentes DOM nativos, e não
entra no bundle da interface. Esses itens se somam ao inventário anterior de 22
pacotes abaixo e não fazem parte daquela contagem histórica. Veja [o design system](docs/DESIGN_SYSTEM.md)
para a API migrada e o escopo da verificação.

O fluxo de trabalho de interface também inclui a skill de instruções `frontend-design` da Anthropic em `.agents/skills/frontend-design`, com seu `LICENSE.txt` Apache-2.0 preservado. A revisão fixa e os hashes dos arquivos estão registrados em [docs/UI_SKILLS_SOURCES.md](docs/UI_SKILLS_SOURCES.md). As diretrizes da Vercel consultadas são referências por link e não são redistribuídas aqui. A skill instalada é orientação de desenvolvimento, não uma dependência de runtime JavaScript.

O refinamento de interface seguinte usa `pbakaus/impeccable`, revisão fixa `8409a564d1baee90b2dde4f7a8f06288838e3921`, em `.agents/skills/impeccable`, com sua licença Apache-2.0 preservada. O motor conferido por checksum é uma ferramenta de desenvolvimento separada, no cache externo do operador, e não vai junto com a aplicação. Fontes e hashes estão registrados no mesmo inventário de skills de interface.

Revisão local: **2026-10-28**. As versões e licenças declaradas abaixo foram conciliadas entre o [web/package-lock.json](web/package-lock.json) (lockfile versão 3) e os 22 manifestos de pacotes instalados em `web/node_modules` no Windows x64. Os arquivos de licença/aviso listados abaixo foram inspecionados localmente. Este inventário registra a stack web instalada; não é uma auditoria jurídica universal nem uma autorização para distribuir um bundle binário.

### Dependências diretas

| Pacote | Versão travada/instalada | Uso | Evidência de licença conferida localmente |
|---|---|---|---|
| `vite` | 8.3.5 | Servidor de desenvolvimento e build de produção da interface | Núcleo MIT; `web/node_modules/vite/LICENSE.md` também contém avisos de dependências incluídas, entre elas BSD-2-Clause, CC0-1.0, ISC e MIT |
| `typescript` | 7.0.2 | Checagem de tipos | Apache-2.0 em `web/node_modules/typescript/LICENSE`; preserve e revise o `NOTICE.txt`, que registra à parte o material de terceiros incorporado |
| `tsx` | 4.23.15 | Launcher TypeScript para backend/start, desenvolvimento e testes | MIT em `web/node_modules/tsx/LICENSE` |
| `@types/node` | 22.20.5 | Declarações de tipos do Node.js | MIT em `web/node_modules/@types/node/LICENSE`; a faixa no manifesto é `^22.0.0`, e esta versão exata está travada |

As quatro aparecem hoje em `devDependencies` no [web/package.json](web/package.json). Esse metadado não quer dizer que elas estejam fora das ferramentas de operação: o comando `start` atual chama o `tsx`. Revise o launcher real e os arquivos empacotados ao preparar uma release.

### Ferramentas transitivas e pacotes nativos instalados

| Pacote | Versão travada/instalada | Uso | Evidência de licença conferida localmente |
|---|---|---|---|
| `rolldown` | 1.2.15 | Bundler do Vite | MIT em `web/node_modules/rolldown/LICENSE`; avisos incorporados adicionais em `THIRD-PARTY-LICENSE` |
| `@rolldown/binding-win32-x64-msvc` | 1.2.15 | Binário do Rolldown específico da plataforma | MIT declarado no `package.json` instalado e na entrada do lockfile; este pacote nativo não tem arquivo de licença próprio, então mantenha/revise os avisos do Rolldown pai se for empacotá-lo |
| `esbuild` | 0.28.2 | Dependência de transformação/carregamento do `tsx` | MIT em `web/node_modules/esbuild/LICENSE.md` |
| `@esbuild/win32-x64` | 0.28.2 | Executável do esbuild específico da plataforma | MIT declarado no `package.json` instalado e na entrada do lockfile; sem arquivo de licença próprio neste pacote nativo, então mantenha/revise a licença do esbuild pai se for empacotá-lo |
| `@typescript/typescript-win32-x64` | 7.0.2 | Compilador TypeScript específico da plataforma | Apache-2.0 no seu `LICENSE`, com `NOTICE.txt` próprio; os avisos do compilador incluem componentes ligados ao Go e outros componentes de terceiros, não só a licença principal do pacote |
| `lightningcss` e `lightningcss-win32-x64-msvc` | 1.33.0 cada | Transformação de CSS do Vite e implementação nativa | **MPL-2.0**, confirmada no `LICENSE` instalado de cada pacote; avalie os arquivos realmente distribuídos e as exigências de código-fonte/avisos aplicáveis antes de redistribuir |
| `@oxc-project/types` | 0.155.0 | Tipos do Rolldown | MIT em `web/node_modules/@oxc-project/types/LICENSE` |
| `@rolldown/pluginutils` | 1.0.1 | Utilitários do Rolldown | MIT em `web/node_modules/@rolldown/pluginutils/LICENSE` |
| `postcss` | 8.5.32 | Processamento de CSS | MIT em `web/node_modules/postcss/LICENSE` |
| `picomatch` | 4.0.7 | Correspondência de padrões | MIT em `web/node_modules/picomatch/LICENSE` |
| `tinyglobby` | 0.2.17 | Correspondência de arquivos | MIT em `web/node_modules/tinyglobby/LICENSE` |
| `fdir` | 6.5.0 | Varredura de arquivos | MIT em `web/node_modules/fdir/LICENSE` |
| `nanoid` | 3.3.20 | Utilitário transitivo de ferramentas | MIT em `web/node_modules/nanoid/LICENSE` |
| `undici-types` | 6.21.0 | Declarações de tipos HTTP do Node.js | MIT em `web/node_modules/undici-types/LICENSE` |
| `detect-libc` | 2.1.2 | Detecção de plataforma para pacotes nativos | Apache-2.0 em `web/node_modules/detect-libc/LICENSE` |
| `picocolors` | 1.1.1 | Cores no terminal | ISC em `web/node_modules/picocolors/LICENSE` |
| `source-map-js` | 1.2.2 | Ferramentas de source map | BSD-3-Clause em `web/node_modules/source-map-js/LICENSE` |

O lockfile também lista builds nativos opcionais para outros sistemas operacionais e arquiteturas, entre eles o `fsevents` no macOS. Esses artefatos não instalados não foram inspecionados aqui; os rótulos SPDX deles no lockfile são metadados, não uma revisão completa dos bytes que acabam distribuídos. O `NOTICE.txt` do TypeScript e os avisos incluídos no Vite/Rolldown também descrevem material que não aparece como pacote npm instalado separado.

Nenhuma etapa de release introduzida por esta implementação web inclui automaticamente `node_modules`, Node.js, PowerShell, executáveis de compilador/bundler, FFmpeg, pesos de modelos ou outros binários externos. O Node.js é um requisito de runtime externo; sua distribuição e os avisos incorporados ficam fora do inventário do lockfile npm. Se um instalador ou arquivo futuro incluir algum desses artefatos, preserve os arquivos LICENSE/NOTICE relevantes e revise aquele artefato e plataforma concretos antes de distribuir. A licença Apache-2.0 do projeto não substitui os avisos de terceiros.
