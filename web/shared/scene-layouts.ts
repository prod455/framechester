// Mirror of crates/framechester-adapters/src/scene_layout.rs. The Rust renderer is authoritative;
// this copy rejects invalid directives at save/generation time instead of at render time.
// tests/fixtures/scene-layouts.json is shared by both test suites to keep them identical.
export const sceneLayouts=['destaque','pergunta','numero','lista','comparacao','linha-do-tempo','citacao'] as const;
export type SceneLayout=typeof sceneLayouts[number];

const maxSlot=160,maxValue=16;
export class SceneLayoutError extends Error {}
const fail=(sceneId:number,detail:string)=>new SceneLayoutError(`Cena ${sceneId}: diretiva visual inválida; ${detail}.`);
const length=(value:string)=>[...value].length;
function slot(sceneId:number,value:string,max=maxSlot):string {
  const result=value.trim();
  if(!result||length(result)>max)throw fail(sceneId,`cada campo precisa de 1 a ${max} caracteres`);
  return result;
}
function pair(sceneId:number,args:string):[string,string] {
  const parts=args.split('|');
  if(parts.length!==2)throw fail(sceneId,"use exatamente dois campos separados por '|'");
  return [slot(sceneId,parts[0]!),slot(sceneId,parts[1]!)];
}
function items(sceneId:number,args:string):string[] {
  const rows=args.split(';').map(item=>slot(sceneId,item));
  if(rows.length<2||rows.length>5)throw fail(sceneId,"informe de 2 a 5 itens separados por ';'");
  return rows;
}
function entry(sceneId:number,value:string):void {
  const at=value.indexOf(':');
  if(at<0)throw fail(sceneId,"cada item precisa do formato 'rotulo: texto'");
  slot(sceneId,value.slice(0,at),40);slot(sceneId,value.slice(at+1));
}
const normalized=(value:string)=>value.split(/\s+/).filter(Boolean).join(' ').toLowerCase();
function spoken(sceneId:number,value:string,narration:string,what:string):void {
  if(!normalized(narration).includes(normalized(value)))throw fail(sceneId,`${what} '${value}' precisa aparecer na narração da cena`);
}

/** Returns the layout declared on the first line of `visualBrief`, or throws SceneLayoutError. */
export function parseSceneLayout(sceneId:number,visualBrief:string,narration:string):SceneLayout {
  const first=(visualBrief.split('\n')[0]??'').trim();
  // `# Titulo` (Markdown) is a free note; a directive starts with a letter.
  if(!/^#\p{Alphabetic}/u.test(first))return 'destaque';
  const directive=first.slice(1),space=directive.search(/\s/);
  const name=space<0?directive:directive.slice(0,space),args=space<0?'':directive.slice(space).trim();
  switch(name){
    case 'destaque':if(args)throw fail(sceneId,'#destaque não recebe campos');return name;
    case 'pergunta':slot(sceneId,args);return name;
    case 'numero':{
      const [value]=pair(sceneId,args);
      if(length(value)>maxValue||!/[0-9]/.test(value))throw fail(sceneId,`o valor precisa conter um dígito e até ${maxValue} caracteres`);
      spoken(sceneId,value,narration,'o valor');return name;
    }
    case 'lista':items(sceneId,args);return name;
    case 'comparacao':{const [left,right]=pair(sceneId,args);entry(sceneId,left);entry(sceneId,right);return name;}
    case 'linha-do-tempo':items(sceneId,args).forEach(item=>entry(sceneId,item));return name;
    case 'citacao':{const [quote]=pair(sceneId,args);spoken(sceneId,quote,narration,'a citação');return name;}
    default:throw fail(sceneId,`'#${name}' não existe; use ${sceneLayouts.join(', ')}`);
  }
}

/** Grammar given to the model and shown in the editor; docs/GUIA_VISUAL.md explains each layout. */
export const sceneLayoutGrammar=`Primeira linha opcional de visualBrief, uma diretiva por cena (o restante do visualBrief é nota livre):
#pergunta TEXTO — pergunta grande; use no gancho ou para abrir um loop.
#numero VALOR | LEGENDA — VALOR com dígito, até 16 caracteres, dito literalmente na narração da mesma cena.
#lista A; B; C — 2 a 5 passos ou itens curtos.
#comparacao RÓTULO: texto | RÓTULO: texto — dois lados.
#linha-do-tempo MARCO: texto; MARCO: texto — 2 a 5 marcos em ordem.
#citacao FRASE | ATRIBUIÇÃO — FRASE dita literalmente na narração; só citação documentada nas fontes.
Sem diretiva (ou #destaque) — título da cena e trecho da narração.
Cada campo tem até 160 caracteres. Não use outras diretivas.`;
