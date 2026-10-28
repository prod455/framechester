import 'basecoat-css/basecoat';
import 'basecoat-css/tabs';
import {el} from './dom.ts';

export interface EditorTab {key:string;label:string;content:HTMLElement}
/** Basecoat owns selection, ARIA state and keyboard navigation; panels stay mounted. */
export function editorTabs(label:string,items:EditorTab[],onChange?:(key:string)=>void):{node:HTMLElement;activate:(key:string)=>void} {
  const id=`tabs-${crypto.randomUUID()}`;
  const nav=el('nav',{role:'tablist','aria-label':label,'aria-orientation':'horizontal','data-variant':'line'});
  const root=el('div',{className:'tabs editor-tabs'},nav);
  const buttons=new Map<string,HTMLButtonElement>();
  items.forEach((item,index)=>{
    const tabId=`${id}-${index}`,panelId=`${tabId}-panel`;
    const tab=el('button',{type:'button',role:'tab',id:tabId,'aria-controls':panelId,'aria-selected':String(index===0),tabindex:index===0?'0':'-1'},el('span',{className:'button-label',title:item.label},item.label));
    const panel=el('section',{role:'tabpanel',id:panelId,'aria-labelledby':tabId,hidden:index!==0,tabindex:'-1'},item.content);
    nav.append(tab);root.append(panel);buttons.set(item.key,tab);
  });
  const notify=()=>{const selected=[...buttons].find(([,tab])=>tab.getAttribute('aria-selected')==='true');if(selected)onChange?.(selected[0]);};
  for(const event of ['click','keydown'])root.addEventListener(event,input=>{if(input.target instanceof Element&&input.target.closest('[role="tab"]'))notify();});
  queueMicrotask(()=>{window.basecoat?.initAll();notify();});
  return {node:root,activate:key=>{window.basecoat?.initAll();const tab=buttons.get(key);tab?.click();tab?.focus({preventScroll:true});}};
}

/** Required fields in an inactive tab must be revealed before native validation focuses them. */
export function revealControl(control:HTMLElement):void {
  window.basecoat?.initAll();
  const panels:HTMLElement[]=[];
  for(let parent=control.parentElement;parent;parent=parent.parentElement)if(parent.getAttribute('role')==='tabpanel')panels.unshift(parent);
  for(const panel of panels){const id=panel.getAttribute('aria-labelledby');if(id)document.getElementById(id)?.click();}
}
