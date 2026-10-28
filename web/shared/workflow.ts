import type { AppState, WebJob } from './types.ts';

export function summarizeWorkflow(state: AppState, jobs: WebJob[], channelId: string) {
  const channel=state.channels.find(item=>item.id===channelId);
  const own=<T extends {channelId:string}>(items:T[])=>channel ? items.filter(item=>item.channelId===channelId) : [];
  const counts={research:own(state.research).filter(item=>item.status!=='archived').length,scripts:own(state.scripts).filter(item=>item.status!=='archived').length,active:own(jobs).filter(item=>item.status==='running'||item.status==='queued').length,review:own(jobs).filter(item=>item.status==='needs_review'&&item.videoAvailable).length,failures:own(jobs).filter(item=>item.status==='failed'||item.status==='blocked').length};
  type Next={kind:string;page:'channels'|'research'|'scripts'|'production';title:string;description:string;action:string};
  let next:Next;
  if(!channel) next={kind:'setup',page:'channels',title:'Organize seu primeiro canal',description:'Defina público e proposta editorial para começar a pesquisa.',action:'Criar canal'};
  else if(counts.active) next={kind:'watch',page:'production',title:'A produção está em andamento',description:'Acompanhe a fila e confira os resultados quando o vídeo estiver disponível.',action:'Acompanhar produção'};
  else if(counts.review) next={kind:'review',page:'production',title:'Seu vídeo precisa de uma revisão',description:'Assista ao resultado e confira os fatos, o áudio e os direitos de uso.',action:'Revisar vídeo'};
  else if(counts.failures) next={kind:'resolve',page:'production',title:'Uma produção precisa de atenção',description:'Confira o diagnóstico antes de iniciar uma nova tentativa.',action:'Ver diagnóstico'};
  else if(counts.scripts) next={kind:'prepare',page:'production',title:'Leve o roteiro para a produção',description:'Revise as fontes e prepare o vídeo. Os visuais explicativos são criados a partir do roteiro.',action:'Preparar vídeo'};
  else if(counts.research) next={kind:'write',page:'scripts',title:'Transforme a pesquisa em roteiro',description:'Escolha uma pauta e desenvolva a promessa, as falas e as cenas.',action:'Escrever roteiro'};
  else next={kind:'research',page:'research',title:'Qual pergunta seu próximo vídeo vai responder?',description:'Investigue o público e registre um ângulo original que você consegue sustentar.',action:'Pesquisar uma pauta'};
  return {counts,next};
}
