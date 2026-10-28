# Revisão de marketing e YouTube para uso local

Consulta: **28/10/2026**, America/Sao_Paulo. Escopo: o produto local e suas
interfaces de criação, pesquisa e resultados. Foram aplicados os procedimentos
`marketing-director`, `youtube-channel-analysis`, `platform-compliance` e
`marketing-scriptwriting`. Nenhum canal real, extrato privado ou prompt pessoal
foi acessado; nenhuma publicação, compra ou chamada paga foi realizada.

## Parecer por capacidade

O Studio oferece uma base para pesquisar, escrever e revisar conteúdo local.
A evidência desta revisão não permite aprovar uma operação comercial completa
nem afirmar que o canal do operador é elegível ou lucrativo. A prontidão técnica
integrada e a jornada no navegador são verificações separadas desta revisão.

| Capacidade | Evidência observada | Limite para a operação |
|---|---|---|
| Pesquisa de nichos | Hipóteses, público, diferenciação, fontes e escores manuais; descoberta YouTube explícita e limitada a oito resultados | Amostra pública não mede demanda representativa, receita ou concorrência completa |
| Roteiro e narrativa | Gancho, cenas, locução, visual, fontes e alegações; arco narrativo separado | O arco não altera automaticamente o texto das cenas; fatos e qualidade continuam exigindo revisão |
| Criação por IA local | Três tarefas limitadas, sem ferramentas, nuvem recusada, contexto do próprio canal e opt-in para referências | Nenhum LLM real foi avaliado nesta revisão; mocks verificam o contrato do conector, não criatividade ou resistência semântica à injeção |
| Identidade editorial | Dados do canal selecionado acompanham cada pedido | Foi corrigida uma instrução global que impunha português a canais configurados em outros idiomas |
| Monetização YouTube | `estimatedRevenue` consultado em BRL, separado de pagamentos; indisponibilidade preservada como desconhecida | Exige OAuth, permissões e canal elegível; consulta real com a conta do operador ainda não foi verificada |
| TikTok, Instagram e Facebook | Perfil/contadores autorizados; recebimentos manuais identificados | A integração atual não importa receita automática dessas redes |
| Análise de desempenho | Snapshot agregado por canal/rede e janela solicitada | Não há diagnóstico completo por vídeo, formato, CTR, retenção, fonte de tráfego ou `engagedViews` no painel web atual |
| Direitos e publicação | Pacote revisável e publicação web desativada | Licenças da voz/modelo, imagens, música e demais recursos precisam ser conferidas por peça; o exemplo Faber permanece com pendência comercial documentada |

## Correção implementada e testes

`web/server/creative.ts` forçava respostas em português brasileiro apesar de
enviar `channel.language` ao modelo. A regra agora orienta o idioma do canal,
permitindo mudança somente quando o briefing a solicita explicitamente. Dados
de referência e preferências pessoais não recebem essa autoridade. O idioma
da interface do Studio permanece o mesmo.

A nova regressão usou dois canais sintéticos e um canal em `en-US`; falhou pela
ausência da regra de idioma e passou após a correção. A suíte executada foi:

```powershell
cd web
node --import tsx --test tests/creative.test.ts tests/social.test.ts tests/finance.test.ts
```

Resultado: **34 testes aprovados**, zero falhas ou skips. Cobrem o contrato de
criação, isolamento de referências, saída de rascunho, ausência de gravação
automática, recusa de nuvem, respostas inválidas, proteção HTTP do prompt,
identidade das conexões, OAuth/refresh, consulta de métricas e finanças por moeda.
As respostas de APIs e modelo são fixtures. Não foi feita inferência real.

## Conferência das políticas atuais

Os pontos abaixo foram reconferidos nas fontes oficiais. As afirmações
anteriores em `MARKETING_YOUTUBE_OPERACIONAL.md` sobre a mudança anunciada para
2027 continuam sustentadas pelas páginas consultadas; não devem ser confundidas
com requisitos já vigentes em outubro de 2026.

| Tema | Situação consultada e efeito no produto |
|---|---|
| Entrada atual no YPP para anúncios | A página apresenta 1.000 inscritos mais 4.000 horas qualificadas em 12 meses ou 10 milhões de views qualificadas de Shorts em 90 dias. Há análise e requisitos adicionais; contagens de canais diferentes não se somam para aprovação. [Ajuda YPP](https://support.google.com/youtube/answer/72851?hl=pt-BR) |
| Mudanças anunciadas | O anúncio de 10/08/2026 prevê vigência em 01/02/2027, novos limiares de 8.000 horas ou 20 milhões de views qualificadas de Shorts para novos candidatos e condição própria de receita Shorts. A ajuda pede revisar/aceitar os termos no Studio até 31/01/2027. Isso exige conferência do operador na conta; não há aceite automático neste software. [Anúncio oficial](https://blog.youtube/intl/pt-br/news-and-events/novas-oportunidades-e-mudancas-programa-de-parcerias-do-youtube/), [Ajuda YPP](https://support.google.com/youtube/answer/72851?hl=pt-BR) |
| Originalidade | Material genérico, repetitivo, produzido em massa ou reaproveitado sem contribuição significativa pode impedir monetização. Automatizar tarefas não substitui substância própria nem revisão do catálogo. Os guias do conector pedem demonstração, explicação e promessa honesta, mas não certificam a saída. [Políticas de canais](https://support.google.com/youtube/answer/1311392?hl=en) |
| Conteúdo sintético | A declaração considera o material real, especialmente cenas realistas e alterações significativas. Assistência isolada a roteiro/título/thumbnail consta entre os exemplos dispensados; declarar IA, por si só, não impede receita. A flag genérica do pacote local não substitui a decisão na tela de upload. [Transparência de IA](https://support.google.com/youtube/answer/14328491?hl=pt-BR) |
| Formato Shorts | Para canais padrão, uploads atuais quadrados/verticais de até três minutos são classificados como Shorts; um vídeo horizontal curto não se torna Short somente pela duração. [Ajuda Shorts](https://support.google.com/youtube/answer/15424877?hl=pt-BR) |
| Receita e análise | `estimatedRevenue` é estimativa sujeita a ajustes; a API admite BRL e exige escopo monetário e condições do canal. Janela solicitada não garante dados completos até seu último dia. Não dividir essa estimativa por views agregadas para inventar RPM por formato. [Métricas](https://developers.google.com/youtube/analytics/metrics), [relatórios por canal](https://developers.google.com/youtube/analytics/channel_reports), [consulta e datas](https://developers.google.com/youtube/analytics/reference/reports/query) |

## Próximo piloto editorial proposto

Antes de aumentar o número de canais ou a frequência, concluir **um episódio
original no canal existente**, com o identificador local conferido pelo operador.
Não há recomendação de gasto nem previsão de receita neste piloto.

1. Selecionar uma pergunta específica e registrar público pretendido, hipótese
   de interesse, fontes independentes e uma explicação ou demonstração própria.
   Não tratar escores manuais ou a amostra de oito vídeos como validação de mercado.
2. Escrever a promessa, entregar uma informação útil na abertura, desenvolver
   a resposta e mostrar as limitações. Distinguir fala, visual e evidência.
   Conferir que título e thumbnail descrevem o que o vídeo realmente entrega.
3. Usar voz, modelo e mídia com condições de uso compatíveis, produzir o pacote
   e revisar áudio, enquadramento, legendas, fatos e originalidade. Sem resolução
   dos direitos da voz escolhida, o piloto não é aprovado para monetização.
4. Após revisão e autorização específicas, o operador decide o upload manual,
   público, declarações aplicáveis e recurso de monetização da conta. O Studio
   web continua sem publicar. A autorização não foi dada nesta revisão.
5. Registrar tempo/custo real de produção e observar resultados em janelas
   declaradas, separando Shorts e longos. CTR/retenção e fontes de tráfego devem
   vir do YouTube Studio/exportação autorizada enquanto o painel não os integra.
   Guardar estimativas, recebimentos e custos em classes distintas.

Continuar se o fluxo produzir uma peça compreensível, original, com direitos
resolvidos e esforço sustentável para o operador. Ajustar a promessa/execução
quando a revisão ou os dados indicarem um problema específico. Sem dados reais
de audiência, custos e monetização, **o retorno econômico permanece desconhecido**.
