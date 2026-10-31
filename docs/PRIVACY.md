# Privacidade e limites dos dados

Cada instância self-hosted controla seus próprios dados de canal, arquivos de conteúdo e tokens. Nenhum serviço central do Framechester recebe esses dados. Telemetria padrão: desligada. Provedores opcionais de terceiros exigem configuração explícita e podem processar o conteúdo enviado conforme os próprios termos. Tokens das plataformas nunca aparecem em exemplos, logs ou relatos de bugs; relatórios financeiros ficam locais. O operador controla as políticas de retenção e exclusão. Backups remotos criptografados são opcionais, e as chaves ficam separadas dos dados copiados. A aplicação da GDPR/LGPD depende dos dados pessoais efetivamente coletados e da jurisdição do operador; não há nenhuma declaração automática de conformidade.

## Contas conectadas (YouTube, TikTok, Instagram, Facebook)

Quando o operador conecta uma conta, o Studio guarda **só no computador dele**:

- os tokens de acesso, criptografados no cofre local;
- o identificador da conta na plataforma (no TikTok, o `open_id`), o nome de exibição e os
  escopos concedidos;
- os contadores que a plataforma devolve (por exemplo seguidores e curtidas), com a data da
  coleta.

Esses dados não são enviados a nenhum servidor do Framechester, não são vendidos nem
compartilhados e só servem para mostrar o desempenho dos canais do próprio operador.

**Como apagar:** em **Avançado → Contas conectadas**, use **Remover vínculo local**: o token sai do
cofre. Para revogar o acesso também na plataforma, remova o aplicativo nas configurações de
segurança da sua conta (no TikTok: Configurações e privacidade → Segurança → Apps e
serviços). Apagar a pasta de dados do Studio remove todo o restante.

Veja também os [termos de uso](TERMOS_DE_USO.md).
