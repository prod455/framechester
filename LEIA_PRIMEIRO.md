# Framechester — leia primeiro

**Estado:** versão 0.1.0. Produção completa e local: roteiro (manual ou com IA) → fontes revisadas por pares → visuais explicativos → narração PT-BR → render FFmpeg → QA → vídeo aprovado para upload manual. Publicação automática continua desativada.

## Primeira vez

```bash
npm run setup          # dependências do Studio e build do motor Rust
npm run voices:setup   # Kokoro PT-BR e vozes comerciais fixadas
npm start              # http://127.0.0.1:4317
```

1. Crie a senha local e cadastre o canal.
2. Em **Configurações**, escolha o provedor de IA (Ollama local, Claude ou OpenAI; chaves ficam no cofre).
3. Em **Produção → Produzir com IA**, descreva o assunto e o formato. O Studio gera o roteiro, busca fontes no Crossref, monta os visuais, a voz e a prévia.
4. Em **Roteiros → Fontes e revisão**, leia as fontes, ajuste o que for preciso e marque **Conferi e cruzei as fontes e as alegações**. Salve.
5. Em **Produção → Produzir com IA → Controles avançados → Abrir preparação manual → Gerar versão final**. O job termina como **Concluído** com o vídeo aprovado.
6. Baixe o MP4, as legendas, a descrição e as fontes em **Revisar vídeo** e publique manualmente no YouTube Studio.

Guia completo: [`docs/WEB_STUDIO.md`](docs/WEB_STUDIO.md). CLI sem Studio: [README](README.md#uso-pela-cli).

## Regras que o software impõe

- Nada é publicado, comprado ou enviado para backup remoto sem ação explícita; `dry_run` é o padrão.
- Segredos ficam só no cofre local; telemetria desligada.
- O QA reprova apenas defeitos que a máquina prova (contradição marcada, fonte fora do inventário, URL insegura, narração duplicada, prompt injection, asset sem direitos, Short acima de 180 s). O resto é decisão do operador.
- Nunca commite `framechester.toml`, chaves, mídia real ou dados pessoais.

**Escopo monetário:** seus vídeos monetizam nas plataformas; o software não inclui venda, afiliados nem faturamento como SaaS.
