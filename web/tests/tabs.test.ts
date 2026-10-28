import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
const browser=new Window({url:'http://localhost:4318'});
for(const name of ['window','document','Node','Element','HTMLElement','HTMLFormElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','HTMLDialogElement','Event','MouseEvent','KeyboardEvent','CustomEvent','MutationObserver'] as const)Object.assign(globalThis,{[name]:name==='window'?browser:name==='document'?browser.document:browser[name]});
const {editorTabs,revealControl}=await import('../src/ui-tabs.ts');
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('Basecoat tabs keep mounted values and provide roving keyboard navigation',async()=>{
  const first=document.createElement('input');first.value='Rascunho não salvo';
  const second=document.createElement('input');second.required=true;
  const tabs=editorTabs('Partes do editor',[{key:'brief',label:'Briefing',content:first},{key:'sources',label:'Fontes',content:second}]);document.body.append(tabs.node);await tick();
  const buttons=tabs.node.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  buttons[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  assert.equal(buttons[1].getAttribute('aria-selected'),'true');assert.equal(buttons[1].tabIndex,0);assert.equal(first.value,'Rascunho não salvo');
  tabs.activate('brief');assert.equal(second.closest<HTMLElement>('[role="tabpanel"]')!.hidden,true);
  revealControl(second);assert.equal(second.closest<HTMLElement>('[role="tabpanel"]')!.hidden,false);
  assert.equal(first.value,'Rascunho não salvo');document.body.replaceChildren();
});

test('a truncated tab keeps the full name and selecting its label still activates the panel',async()=>{
  const fullName='DesenvolvimentoMuitoLongo'.repeat(15);
  const first=document.createElement('p'),second=document.createElement('p');
  const tabs=editorTabs('Documento',[{key:'first',label:'Abertura',content:first},{key:'second',label:fullName,content:second}]);
  document.body.append(tabs.node);await tick();
  const tab=tabs.node.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1];
  assert.equal(tab.textContent,fullName);
  const label=tab.querySelector<HTMLElement>('.button-label');
  assert.equal(label?.title,fullName);
  label!.click();
  assert.equal(tab.getAttribute('aria-selected'),'true');
  assert.equal(second.closest<HTMLElement>('[role="tabpanel"]')!.hidden,false);
  document.body.replaceChildren();
});
