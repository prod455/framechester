# ADR-0001 - Framechester V4: baseline de renderizacao FFmpeg (CPU x AMF)

**Status:** aceita (baseline `libx264`; `h264_amf` como candidato para previa)
**Data:** 27/10/2026
**Decisao:** `libx264` CPU e o default obrigatorio do MVP; `h264_amf` fica registrado como caminho de previa/experimental no hardware AMD, sem promover a default enquanto VMAF e rate control nao forem validados em cena real.

## Contexto

O MVP exige um curto (65-90 s) e um longo (7-12 min) originais. O plano define `libx264` como baseline de qualidade e comparar AMF na RX 6600. O inventario local registrou FFmpeg 9.0.1-full_build (MSYS2) com `libx264`, `libx265`, `h264_amf`, `hevc_amf`, `libvmaf`, `libass`, `libvpx`, `libvpx-vp9`; GPU AMD Radeon RX 6600 (driver 32.0.21045.16010).

## Fatos medidos

### Amostra curta (720p, 5 s, testsrc+sine)

| Variante | Comando (resumo) | Wall time | Tamanho | Status |
|---|---|---|---|---|
| `libx264` baseline | `-c:v libx264 -preset medium -crf 23 -c:a aac` | ~0,58 s | ~107 KiB | OK |
| `h264_amf` | `-c:v h264_amf -b:v 1000k -c:a aac` | ~0,86 s | ~193 KiB | OK |

SSIM entre encodes de taxa equivalente: All = 0,973, Y = 0,974, U = 0,975, V = 0,971. **Ressalva:** o teste curto comparou taxas diferentes e superestimou a similaridade; o benchmark 1080p abaixo e o resultado valido para decisao.

### Benchmark 1080p30 (20 s, execucao sequencial)

Fixture: `testsrc2` 1920x1080 @30 fps, 20 s, `yuv420p`, audio `sine` 440 Hz; mezanino lossless `libx264 -qp 0` (82,9 MB, 1,2 s). Conteudo sintetico de alto detalhe/movimento — pior caso, **nao** representa cena real.

| Variante | Comando (resumo) | Tempo | Speed | Tamanho | SSIM All | VMAF |
|---|---|---|---|---|---|---|
| `libx264` medium | `-preset medium -crf 20` | 4,94–5,34 s | ~4x | 6,13 MB | 0,9824 | 73,06 |
| `libx264` veryfast | `-preset veryfast -crf 20` | 2,83 s | ~7x | 6,37 MB | 0,9812 | 72,35 |
| `h264_amf` balanced @6M | `-b:v 6000k` (default) | 1,88–1,91 s | ~10,5x | 15,20 MB | 0,9591 | 37,90 |
| `h264_amf` high_quality + vbr_peak @6M | `-usage high_quality -quality high_quality -rc vbr_peak` | 86,32 s | ~0,23x | 15,05 MB | 0,9592 | 38,09 |
| `h264_amf` high_quality + qvbr 23 | `-rc qvbr -qvbr_quality_level 23` | 62,14 s | ~0,32x | 51,56 MB | nao medido | nao medido |

- O `h264_amf` deste build **aceita** `-quality`/`-preset` (`balanced|speed|quality|high_quality`), `-usage`, `-rc` (`cqp|cbr|vbr_peak|vbr_latency|qvbr|hqvbr|hqcbr`) e `-profile`. **Nao** existe `-crf`; usar `-rc qvbr -qvbr_quality_level N` para qualidade variavel. Valores no estilo x264 (`medium`, `crf 23`) foram rejeitados.
- Os presets de qualidade do AMF **nao** melhoraram SSIM/VMAF nesta fixture e custaram 16-45x mais tempo.
- `libx264 veryfast` entrega VMAF ~72 em 2,83 s; AMF balanced entrega VMAF ~38 em 1,9 s. AMF e ~33% mais rapido que `veryfast`, com metade do VMAF.

## Alternativas

### Alternativa A - `libx264` CPU (baseline)
- **Pro:** portabilidade Linux/Windows, previsibilidade, VMAF ~72-73, sem dependencia de runtime GPU.
- **Con:** CPU-bound; throughput menor em renders longos.
- **Custo:** nao usa a GPU AMD.

### Alternativa B - `h264_amf` (AMD AMF)
- **Pro:** ~1,9 s no modo balanced; util para previa rapida.
- **Con:** VMAF ~38 nesta fixture; presets de qualidade lentos; dependencia de stack Windows/MediaFoundation; reprodutibilidade Linux exige VA-API; licenca/redistribuicao do build a revisar.
- **Uso decidido:** previa/rascunho, nunca render final sem nova validacao.

### Alternativa C - NVENC / outros
- **Descartada** para este hardware (AMD).

## Decisao

Manter `libx264` CPU como baseline obrigatoria do MVP (`-preset veryfast -crf 20` no perfil default, ajustavel). Registrar `h264_amf` como comparador validado apenas para previa. Nao promover AMF a default sem benchmark com cena real, VMAF >= baseline e rate control estavel.

## Consequencias

- O pipeline usa `config.render.video_codec`; default `libx264`.
- Monitorar CPU por job nos renders longos.
- Benchmark com 1 segmento longo e 1 curto de cena real antes de qualquer mudanca de default.
- Se AMF for validado, migrar com rollback documentado.

## Evidencia

- `docs/00-inventario-e-viabilidade.md` secoes 3.2-3.3.
- Comandos: `ffmpeg -version`, `ffmpeg -encoders`, `ffmpeg -hwaccels`, baseline libx264, `h264_amf` balanced/high_quality/qvbr, `ffmpeg -lavfi libvmaf`, `ffprobe`.
- Render e2e local: 66,5 s 1080p30, QA tecnico pass (decodificacao, blackdetect, freezedetect, audio level).
