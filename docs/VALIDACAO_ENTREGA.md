# Validação da entrega

Data: **2026-10-27**, America/Sao_Paulo. Registro de comandos e resultados observados nesta sessão. Uma execução local não comprova aprovação no YPP, direitos comerciais de todos os assets, prontidão editorial de qualquer vídeo ou lucro do operador.

## Skills: estrutura, referências e comportamento

O validador oficial `scripts/quick_validate.py` da skill de sistema `skill-creator` aprovou **33/33 SKILL.md** presentes em `.agents/skills/`. O primeiro ensaio falhou por ausência de PyYAML; em seguida foi instalado **PyYAML 6.0.3** com `python -m pip install --target <diretório temporário isolado> PyYAML`. `PYTHONPATH` foi definido apenas no processo de validação. Nenhuma dependência foi adicionada ao projeto nem à instalação global de Python.

Procedimento executado: enumerar os diretórios de `.agents/skills/`, chamar `quick_validate.py <diretório>` em cada um e interromper no primeiro retorno diferente de zero. Retorno final: `OFFICIAL_VALIDATED_COUNT=33`. Uma checagem adicional resolveu os **50 links relativos** dos SKILL.md; **zero destinos ausentes**. Nos dez módulos de marketing escritos pela curadoria, também foram conferidos nome/diretório, descrição, licença Apache-2.0, artefato com canal e cenários normal/adverso.

Esses resultados validam estrutura e referências; não equivalem a testar todas as decisões de todas as skills. [skills-sources.lock.md](skills-sources.lock.md) distingue os procedimentos locais das referências externas, que não foram instaladas ou redistribuídas.

### Cenário de comportamento executado

Pedido bruto: comparar lucro de `tech` (Shorts, 10.000 views totais, engaged views desconhecidas, USD 10 estimados, 01–07/out) e `science` (longos, 10.000 views, BRL 50 recebidos, 01–27/out), sem YPP confirmado, custos ou horas. Aplicadas `marketing-data-analysis` e `youtube-channel-analysis` com o contrato compartilhado.

A execução produziu análise por canal e conclusão conjunta em `artifacts/skill-forward-test/marketing-comparison.md`, com os seguintes resultados observados:

- Lucro de caixa e econômico permanecem desconhecidos; faltam custos e trabalho.
- Janelas, moedas, formatos e classes de receita diferentes não foram fundidos nem ranqueados como se fossem comparáveis.
- USD 10 permaneceu estimativa; BRL 50 permaneceu recebimento declarado, sem atribuição automática à competência das views.
- Shorts sem engaged views não gerou RPM inventado. Recebimento não foi dividido pelas views para simular RPM do período.
- YPP e recursos permaneceram desconhecidos, sem converter pagamento declarado em habilitação atual ou apagar esse pagamento por falta de confirmação.
- Nenhuma conta foi acessada. Os artefatos são de avaliação e não representam analytics privados do operador.

Esse primeiro passe foi executado pelo agente que também escreveu as duas skills. Um segundo passe cego foi executado por outro subagente sem histórico, com os arquivos das skills, contrato e pedido bruto, sem gabarito e sem acesso ao primeiro resultado. Resultado independente em `artifacts/skill-forward-test-independent/resultado.md`, lido e conferido: ranking de lucro indeterminado, receitas em classes separadas, custos ausentes preservados como `null`, ausência de conversão cambial arbitrária e de RPM com denominador incompatível. O agente informou leitura somente dos quatro documentos autorizados e do arquivo que produziu, sem acessar contas ou modificar código/skills. Não foi necessária alteração das skills após esse cenário. Este passe cobre o cenário informado; não é garantia de comportamento em toda situação possível.

## OAuth e isolamento por canal

TDD observado: a primeira execução da nova suíte multicanal falhou antes da implementação. Após a implementação e revisão, os testes cobrem caminhos separados, ausência de fallback global, slug inválido, identidade obrigatória, canal divergente/ausente/ambíguo, preservação do token após falha de refresh e compatibilidade do modo legado. Rede e OAuth reais são substituídos por mocks.

A revisão adicional reproduziu dois defeitos e adicionou regressões antes das correções:

1. `--token-file` igual ao arquivo de cliente OAuth permitia destruir a configuração do cliente no salvamento. A resolução agora rejeita colisão antes de autenticar ou consultar, tanto no modo canal quanto no legado.
2. O refresh preenchia todos os escopos solicitados quando os escopos concedidos eram desconhecidos. O fallback foi removido: ausência permanece ausência e a verificação emite o aviso de escopos não comprovados.

As reproduções anteriores à correção estão em `artifacts/skill-forward-test/oauth-review/findings.md`; esse arquivo é histórico, não lista de bugs ainda ativos.

Comando final executado:

```powershell
python -m unittest discover -s tests -v
```

Resultado desse passe: **46 testes aprovados**, incluindo **18 testes multicanal** e os verificadores/financeiro existentes. O passe final integrado abaixo registra os testes acrescentados depois. Nenhuma credencial real, publicação ou gasto externo foi utilizado nesses testes.

## Analytics em Rust

Comando executado com `cargo` do toolchain local, que não estava no PATH original da sessão:

```powershell
cargo test -p framechester-core analytics::tests
```

Resultado mais recente: **10 testes aprovados**. A primeira versão teve seis falhas de comportamento com os stubs; após implementação, nove testes passaram. Uma revisão semântica acrescentou uma regressão que falhou antes de permitir recebimento de competência anterior durante uma janela sem monetização atual; após a correção, os dez passaram.

Cobertura observada: isolamento por canal, origem explícita, moeda BRL, calendário real e janela ordenada, limites de views intencionais, dados ausentes preservados, denominador zero, RPM de Shorts sobre engaged views e receitas estimada/recebida separadas. Receita estimada positiva na janela contradiz monetização desabilitada; pagamento recebido pode se referir a competência anterior e não altera o RPM nem habilita monetização presente.

Também foi executado `cargo clippy -p framechester-core --all-targets -- -D warnings`, aprovado novamente após a última correção semântica. A validação final do workspace e os pilotos completos devem registrar abaixo seu próprio comando e resultado, sem inferir aprovação a partir deste teste parcial.

## Limites desta evidência

Os testes de analytics usam fixtures sanitizadas. O OAuth não foi autenticado com um canal real. O forward-test usa somente números fornecidos no pedido artificial; não determina a rentabilidade dos canais do operador. A validação estrutural de skills e as referências oficiais não constituem parecer jurídico nem garantia de monetização.

## Validação integrada final do workspace

Executados sequencialmente, verificando o exit code de cada etapa:

```powershell
cargo fmt --all
cargo build --workspace
cargo test --workspace --quiet
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all --check
python -m unittest discover -s tests -v
```

Resultado: **build aprovado; 135 testes Rust aprovados (54 adapters, 73 core, 1 CLI unit e 7 CLI integração), um smoke de mídia ignorado na suíte padrão; Clippy e fmt aprovados; 51 testes Python aprovados**. O smoke ignorado foi executado explicitamente e aprovado pelo responsável do renderer: imagem/vídeo fornecidos, pixels observados, codec, FPS, resolução, áudio, QA positivo e fixture preta reprovada. Fixtures e helpers não acessam canais ou serviços pagos.

O financeiro Python passou a arredondar valores monetários por centavo antes do cálculo, em linha com o modelo Rust. Duas regressões reproduziram subcentavos ocultos e divergência no equilíbrio: 50 GB B2, câmbio hipotético 5,34, custo adicional de R$1, RPM hipotético R$6 e imposto hipotético 10% resultam em custo exibido/modelado de R$2,48 e equilíbrio conservador de 460 views longas. Esses números exercitam a fórmula; não são tarifa atual, faturamento ou previsão de audiência.

A inferência Anthropic está bloqueada antes do POST enquanto não há cotação e controle de orçamento confiáveis. Regressões verificaram esse bloqueio e a redação de credenciais no Debug. Renderer e roteiro autoral operam sem essa API.

Foram corrigidos com testes os falsos sucessos de filtros FFmpeg, codecs divergentes e restore parcial Rust/Python. Restore com erro não é aceito por conter a palavra timestamp, e destino Rust preenchido é rejeitado antes do processo. A validação de dois arquivos de fixture não é apresentada como auditoria de todo um backup.

Nota operacional: recompilar a CLI enquanto outro cargo run ainda a executava no Windows produziu acesso negado ao executável. As verificações finais foram serializadas; o erro não foi tratado como teste aprovado. Termine o processo antes de recompilar e use o binário já construído para repetir o piloto.

## Piloto audiovisual completo e multicanais

Entradas reproduzíveis: `examples/piloto-vertical.topico.json`, `examples/piloto-vertical.roteiro.json` e `scripts/gerar_assets_piloto.py`. O roteiro tem 203 palavras, quatro cenas e referências primárias FFmpeg/YouTube; as claims permanecem `Cited`. Quatro diagramas originais geraram os clipes locais e o manifesto com SHA256; nenhum vídeo real de terceiros foi usado.

O gerador foi executado com o Python bundled que já contém Pillow. Configuração temporária `artifacts/piloto-multicanal/pilot.toml`: canais locais `tech` e `science`, render 640x360 orientado para 360x640 no formato short, Piper PT-BR local, dry-run e telemetria desligada. Esses canais são identidades de demonstração; não foram associados a contas reais.

```powershell
target/debug/framechester.exe --config artifacts/piloto-multicanal/pilot.toml run --channel tech --topic examples/piloto-vertical.topico.json --script examples/piloto-vertical.roteiro.json --assets artifacts/piloto-multicanal/media/assets.json --workdir artifacts/piloto-multicanal/output --burn-subtitles --asr
target/debug/framechester.exe --config artifacts/piloto-multicanal/pilot.toml run --channel science --topic examples/piloto-vertical.topico.json --script examples/piloto-vertical.roteiro.json --assets artifacts/piloto-multicanal/media/assets.json --workdir artifacts/piloto-multicanal/output --burn-subtitles
```

Os dois comandos retornaram zero. `tech`: **76,93 s**, 360x640, 30 fps, H.264/AAC, **3.150.547 bytes**; QA técnico aprovado, incluindo decodificação, ausência de preto/congelamento detectado, áudio e ASR com cobertura **86%** no limiar configurado de 45%. ASR é indicador de correspondência, não transcrição perfeita. `science`: **76,83 s**, mesmo perfil, QA técnico aprovado, sem ASR solicitado. Ambos conservam QA editorial `needs_human`, publisher `dry_run`, ID de vídeo nulo e data de publicação nula.

Foram inspecionados quadros do render e corrigidos dois problemas: heading automático cobrindo o diagrama e fonte das legendas escalada pelo PlayRes implícito. Mídia local agora preserva a composição; legendas usam resolução explícita e margens proporcionais. Os diagramas reservam uma faixa inferior livre para legendas. A prova é uma prévia de resolução reduzida; não é benchmark visual de entrega Full HD.

Uma checagem final leu relatórios/metadados dos dois canais, validou seus caminhos e hashes e confirmou que a execução de `science` **não alterou o MP4 de tech**. Evidência local em `artifacts/piloto-multicanal/isolation_check.json`. O hash de tech permaneceu `14cc9e5580abe38134d5e33244c17bb5fd45e9eef5d40481be40f5e5c92ce99f`.

Vídeos e relatórios ficam em `artifacts/piloto-multicanal/output/channels/<canal>/`, ignorados pelo Git. O mesmo conteúdo em dois canais foi usado somente para testar separação de artefatos, não como estratégia de publicação duplicada. Nenhuma publicação, inferência paga, compra ou backup remoto foi realizado. Direitos da voz/modelo e revisão editorial continuam pendências antes de qualquer uso comercial.

## Studio web local — 28/10/2026

A camada TypeScript/Vite e seu backend Node.js foram implementados e ligados ao motor Rust. O passe final aprovou **47 testes web**, TypeScript/build e o teste real DPAPI com fixture no Windows. O piloto iniciado pelo navegador produziu vídeo, passou pelo QA técnico e permaneceu em revisão humana. Comandos, medidas, evidências de autenticação e limites das integrações estão em [WEB_STUDIO_VALIDACAO.md](WEB_STUDIO_VALIDACAO.md); a operação está em [WEB_STUDIO.md](WEB_STUDIO.md).

A revisão posterior identificou a origem Lessac do modelo Faber do piloto e a restrição de pesquisa dos materiais de sua base. A autorização comercial desse ONNX permanece não demonstrada, conforme [as fontes e os limites registrados](../THIRD_PARTY_NOTICES.md#voz-piloto-autorização-comercial-não-resolvida). Perfis web novos exigem escolher um modelo explicitamente; isso não certifica seus direitos de uso.
