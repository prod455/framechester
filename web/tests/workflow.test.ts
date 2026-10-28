import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeWorkflow } from '../shared/workflow.ts';
import type { AppState } from '../shared/types.ts';
import { defaultConfig } from '../server/store.ts';

function state(): AppState { return {schemaVersion:1,channels:[],config:defaultConfig(),channelConfigs:{},research:[],scripts:[],stories:[],monetization:[],receipts:[]}; }
test('an unknown channel asks for channel setup and does not borrow another channel work', () => {
  const input=state(); input.channels.push({id:'other',name:'Other',createdAt:'',updatedAt:'',description:'',niche:'',audience:'',language:'pt'});
  assert.equal(summarizeWorkflow(input,[],'missing').next.page,'channels');
  assert.deepEqual(summarizeWorkflow(input,[],'missing').counts,{research:0,scripts:0,active:0,review:0,failures:0});
});
test('running work takes precedence and channel isolation applies to review and failures', () => {
  const input=state(); input.channels.push({id:'tech',name:'Tech',createdAt:'',updatedAt:'',description:'',niche:'',audience:'',language:'pt'});
  const jobs=[{id:'a',channelId:'tech',scriptId:'s',status:'running' as const,createdAt:'',message:'',videoAvailable:false},{id:'b',channelId:'other',scriptId:'s',status:'needs_review' as const,createdAt:'',message:'',videoAvailable:true}];
  const summary=summarizeWorkflow(input,jobs,'tech'); assert.equal(summary.next.kind,'watch'); assert.equal(summary.counts.active,1); assert.equal(summary.counts.review,0);
});
test('a video awaiting human review is surfaced before creating more work and never marked published', () => {
  const input=state(); input.channels.push({id:'tech',name:'Tech',createdAt:'',updatedAt:'',description:'',niche:'',audience:'',language:'pt'});
  const jobs=[{id:'review',channelId:'tech',scriptId:'s',status:'needs_review' as const,createdAt:'',message:'',videoAvailable:true}];
  const summary=summarizeWorkflow(input,jobs,'tech'); assert.equal(summary.next.kind,'review'); assert.equal(summary.counts.review,1); assert.equal(summary.next.page,'production');
});
