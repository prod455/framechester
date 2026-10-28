import {randomUUID} from 'node:crypto';
import type {RunnerApi,Script} from '../shared/types.ts';
import type {CreativeApi,CreativeInput} from './creative.ts';
import type {CreativeEditorContext} from '../shared/creative-types.ts';
import {HttpError} from './auth.ts';
import {LocalStore,object,validId} from './store.ts';

export interface AutomaticProductionOptions {store:LocalStore;runner:RunnerApi;creative:CreativeApi}
const direction='Produza um roteiro explicativo original e completo, pronto para narração e composições tipográficas automáticas. Preserve o assunto, o formato e as referências fornecidas. Desenvolva uma progressão narrativa com gancho, explicação, exemplo hipotético identificado e conclusão útil. Não peça capturas, gravações ou tarefas manuais. Reescreva promessas de testes ainda não realizados; não invente resultados, fontes ou pesquisa efetuada. O sistema montará as cenas com texto e voz local. Lacunas factuais continuam pendentes e devem ficar explícitas. Não declare aprovação editorial ou monetização garantida.';

export function createAutomaticProduction(options:AutomaticProductionOptions){
  async function plan(owner:string,raw:unknown){
    const input=object(raw);
    if(Object.keys(input).some(key=>!['brief','format','scriptId','researchId','quoteId','authorizePaid'].includes(key)))throw new HttpError(400,'Opção de produção automática inválida.');
    if(typeof input.brief!=='string'||input.brief.trim().length<3||input.brief.length>2000||input.brief.includes('\0'))throw new HttpError(400,'Descreva o tema ou a orientação para a IA.');
    if(!['short','long'].includes(String(input.format)))throw new HttpError(400,'Escolha o formato do vídeo.');
    if(input.scriptId&&input.researchId)throw new HttpError(400,'Escolha uma pauta ou um roteiro como referência.');
    const state=await options.store.read();const channel=state.channels.find(item=>item.id===owner);
    if(!channel)throw new HttpError(404,'Canal não encontrado.');
    const script=input.scriptId?state.scripts.find(item=>item.id===validId(input.scriptId)&&item.channelId===owner&&item.status!=='archived'):undefined;
    const research=input.researchId?state.research.find(item=>item.id===validId(input.researchId)&&item.channelId===owner&&item.status!=='archived'):undefined;
    if((input.scriptId&&!script)||(input.researchId&&!research))throw new HttpError(400,'A referência não pertence a este canal ou está arquivada.');
    const format=input.format as 'short'|'long';
    const context:CreativeEditorContext={task:'script',values:{title:script?.title??research?.title??input.brief.trim().slice(0,500),researchId:script?.researchId??research?.id,series:script?.series??(channel.niche.slice(0,150)||'principal'),format,hook:script?.hook??'',scenes:script?structuredClone(script.scenes):[],sources:structuredClone(script?.sources??research?.sources??[]),claims:script?structuredClone(script.claims):[]}};
    const generation:CreativeInput={task:'script',brief:`${direction}\nOrientação do operador: ${input.brief.trim()}`,includeReferences:false,editorContext:context};
    return {input,generation,seedId:script?.id??'automatic',researchId:context.values.researchId};
  }
  return {
    async quote(owner:string,input:unknown,scope:string){
      if(!options.creative.quote)throw new HttpError(503,'A estimativa de custo não está disponível.');
      const prepared=await plan(owner,input);return options.creative.quote(owner,{...prepared.generation,consentToSend:true},scope);
    },
    async start(owner:string,input:unknown,scope:string){
      if(!options.runner.startAutomated)throw new HttpError(503,'A produção automática não está disponível.');
      const prepared=await plan(owner,input);
      const capabilities=await options.creative.capabilities(owner);
      if(!capabilities.available)throw new HttpError(503,capabilities.reason);
      if(capabilities.provider!=='ollama'&&(prepared.input.authorizePaid!==true||typeof prepared.input.quoteId!=='string'))throw new HttpError(400,'Calcule o custo e autorize esta produção antes de iniciar.');
      return options.runner.startAutomated(owner,prepared.seedId,async()=>{
        const draft=await options.creative.draft(owner,{...prepared.generation,...(prepared.input.quoteId!==undefined?{quoteId:prepared.input.quoteId,authorizePaid:prepared.input.authorizePaid}:{})},scope);
        if(draft.channelId!==owner||draft.task!=='script'||draft.crossChecked!==false||draft.status!=='draft'||draft.reviewRequired!==true||!draft.fields||!('scenes'in draft.fields))throw new HttpError(503,'A IA não retornou um roteiro válido para este canal.');
        const fields=draft.fields;
        const saved=await options.store.saveResource('scripts',{...fields,channelId:owner,researchId:prepared.researchId,topicId:`topico-${randomUUID()}`,status:'draft',crossChecked:false,claims:fields.claims.map(claim=>({...claim,status:'unverified'}))});
        return (saved as Script).id;
      });
    }
  };
}
