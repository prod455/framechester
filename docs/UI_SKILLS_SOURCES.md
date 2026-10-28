# Skills e critérios da reformulação do Studio

## Passe Impeccable — 28/10/2026

Após a rejeição da revisão em âmbar, foi instalado o pacote oficial
[pbakaus/impeccable](https://github.com/pbakaus/impeccable/tree/8409a564d1baee90b2dde4f7a8f06288838e3921/.agents/skills/impeccable),
com revisão fixa `8409a564d1baee90b2dde4f7a8f06288838e3921`, payload 4.8.0
e licença Apache-2.0 preservada. O helper oficial instalou apenas a skill;
nenhum hook foi habilitado. `frontend-design` da Anthropic permanece como
referência complementar; o pacote Impeccable instalado é a skill atual,
não seu alias legado `frontend-design`.

O contexto foi carregado uma vez. Os guias de simplificação, contenção visual,
acabamento e modo Operate orientaram mudanças reais de composição. O scanner
de fonte foi executado com o engine 0.1.18 verificado pelo launcher. O launcher
não forneceu JSON utilizável na captura inicial; a chamada direta ao mesmo
engine em cache retornou `[]`, exit code zero. Não houve scan de URL, automação
de navegador por outro runtime ou injeção de overlay.

`DO_NOT_TRACK=1`, `IMPECCABLE_NO_TELEMETRY=1` e a configuração de projeto
`.impeccable/config.json` mantêm telemetria desativada. O serviço de sorteio de
estilos e o modo live não foram utilizados.

Hashes SHA-256: SKILL.md `fab04b31f946573b00a8559db1fc070f8ea5825254d491c2b13156e5661a86d7`;
LICENSE.txt `02bb8c3b4e70190e3986c0404ad2fd8d639b4f534252d82379cc1b502b6d1812`.
São agora 33 procedimentos originais e duas skills externas instaladas.
O resultado visual e os limites do passe estão em [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

Consulta em **28/10/2026**, America/Sao_Paulo. Escopo: interface local TypeScript/Vite, sem mudança para React, preservando autenticação, cofre, identidade do canal e gates de produção.

## Seleção com evidência

O [leaderboard skills.sh](https://skills.sh/) foi consultado antes da seleção. Contagens de instalações são as exibidas pelo diretório e não foram verificadas independentemente; estrelas vieram da API oficial GitHub. **Popularidade não comprova eficiência, qualidade ou segurança.** A avaliação útil para este projeto é o resultado implementado, inspecionado no navegador e testado nos fluxos existentes.

| Skill | Popularidade observada | Origem e revisão | Decisão |
|---|---|---|---|
| [frontend-design](https://skills.sh/anthropics/skills/frontend-design) | 1,0 milhão de instalações exibidas; 184.355 estrelas do repositório | [Anthropic](https://github.com/anthropics/skills/tree/dbd4588f9e1033efb41dad4bef2f7947c8993d44/skills/frontend-design), SHA `dbd4588f9e1033efb41dad4bef2f7947c8993d44`; licença Apache-2.0 individual examinada | **Instalada** em `.agents/skills/frontend-design`, sem alterar o conteúdo upstream. Adequada a HTML/CSS/TypeScript; não exige React. |
| [web-design-guidelines](https://skills.sh/vercel-labs/agent-skills/web-design-guidelines) | 794,1 mil instalações exibidas; 33.133 estrelas do repositório | [Vercel](https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/web-design-guidelines), SHA `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62`; [regras remotas](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) lidas nesta data | **Referência consultada, não instalada nem redistribuída.** Não foi encontrada licença explícita na árvore dessa revisão e a API retornou licença nula. Isso não é uma conclusão de que toda utilização seja proibida. |

Os dois SKILL.md e as regras remotas da Vercel foram lidos integralmente. A árvore do módulo Anthropic contém apenas instruções e sua licença; nenhum script desse pacote foi executado. O instalador utilizado foi o helper oficial já instalado do Codex, com destino explícito no projeto, revisão fixa e proteção contra sobrescrita:

```powershell
python C:/Users/dev/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py --repo anthropics/skills --path skills/frontend-design --ref dbd4588f9e1033efb41dad4bef2f7947c8993d44 --dest .agents/skills --method download
```

SHA-256 dos arquivos instalados:

| Arquivo | SHA-256 |
|---|---|
| `SKILL.md` | `d91970639e9f5c37682ac7ab60094d35f1c7c1f38d731bd56396563aee10c1d3` |
| `LICENSE.txt` | `0d542e0c8804e39aa7f37eb00da5a762149dc682d7829451287e11b938e94594` |

A descoberta automática dessa nova skill fica disponível no próximo turno do agente. A leitura explícita de suas instruções já serve à reformulação atual.

## Aplicação e resolução de conflitos

- A direção visual precisa servir à operação editorial: canal selecionado, fila, bloqueios de QA e próxima ação. Não criar uma landing page dentro do painel.
- Tokens de cor, escala tipográfica, espaçamento, bordas, foco e estados devem alimentar componentes reutilizáveis. Sombras e decoração não substituem hierarquia.
- Interface em português usa linguagem direta e sentence case. A sugestão genérica remota de Title Case ou de trocar toda conjunção por `&` não se aplica automaticamente.
- Acessibilidade usa HTML semântico, rótulos, foco visível, texto para estados, feedback assíncrono e respeito à redução de movimento. Regras React ou de hidratação são irrelevantes ao DOM nativo desta aplicação.
- Fontes, scripts e CDNs novos não são requisitos dessas skills. Autenticação, CSRF, loopback, política de publicação e direitos continuam definidos pelo operador e pelo projeto.
- As instruções de skills externas não entram no system prompt pessoal nem recebem autoridade para executar ferramentas, ler segredos, publicar ou gastar.

As skills locais `ui-accessibility`, `ux-operator-workflow`, `marketing-scriptwriting`, `marketing-storytelling` e `anti-injection-and-provenance` continuam responsáveis pelos contratos específicos do Framechester. A nova skill externa complementa a execução visual; não substitui essas regras.

## UX writing: recomendações para implementação

Cada texto deve ajudar a reconhecer estado ou executar uma ação. Termos consistentes, verbos específicos e orientação de recuperação valem mais que slogans. As recomendações abaixo são uma proposta editorial para o código; sua presença nesta tabela não declara que todas já foram implementadas.

| Local ou ação | Texto recomendado |
|---|---|
| Navegação inicial | Painel do canal |
| Lista de canais | Canais |
| Pesquisa | Pesquisa de nichos |
| Descrição de pesquisa | Investigue o público, registre hipóteses e compare fontes. |
| Descrição de roteiro | Transforme a pauta em falas, cenas e fontes conferíveis. |
| Descrição de storytelling | Dê à história uma pergunta clara e uma resolução que cumpre a promessa. |
| Descrição de produção | Gere o vídeo, confira o QA e revise o resultado. |
| Ação que abre a configuração de produção | Preparar vídeo |
| Ação que realmente inicia o job | Gerar vídeo neste computador |
| Confirmação da entrada na fila | Produção adicionada à fila. Acompanhe o andamento aqui. |
| Produção vazia | Nenhum vídeo produzido neste canal. Prepare um roteiro e adicione imagens ou clipes para começar. |
| Resumo financeiro | Recebimentos e custos |
| Explicação de receita estimada | Estimativa da plataforma. Pode sofrer ajustes e não confirma pagamento. |
| Geração de texto com IA | Criar rascunho |
| Salvar personalização editorial | Salvar instruções pessoais |

Textos gerados para vídeos precisam de promessa coerente com o conteúdo, contribuição original, falas naturais e alegações ligadas às fontes. Dados externos não podem promover uma alegação a verificada. Uma sugestão criativa permanece rascunho até revisão. Linguagem persuasiva não autoriza estatísticas fictícias, depoimentos fabricados, promessas de ganho ou aprovação presumida no programa de monetização.
