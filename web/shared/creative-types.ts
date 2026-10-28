import type { Research, Script, Story, Source, ScriptScene, Claim } from './types.ts';
export type CreativeTask='research'|'script'|'story';
export type ResearchCreativeValues=Pick<Research,'title'|'niche'|'audience'|'hypothesis'|'differentiation'|'keywords'|'sources'|'notes'>;
export type ScriptCreativeValues=Pick<Script,'title'|'researchId'|'series'|'format'|'hook'|'scenes'|'sources'|'claims'>;
export type StoryCreativeValues=Pick<Story,'title'|'scriptId'|'hook'|'setup'|'conflict'|'turningPoint'|'resolution'|'cta'>;
export type CreativeEditorContext={task:'research';values:ResearchCreativeValues}|{task:'script';values:ScriptCreativeValues}|{task:'story';values:StoryCreativeValues};
export type ResearchCreativeFields=Omit<ResearchCreativeValues,'sources'>;
export interface ScriptCreativeFields {title:string;series:string;format:'short'|'long';hook:string;scenes:ScriptScene[];sources:Source[];claims:Claim[]}
export type StoryCreativeFields=Omit<StoryCreativeValues,'scriptId'>;
export type CreativeFields=ResearchCreativeFields|ScriptCreativeFields|StoryCreativeFields;
export type CreativeProvider='ollama'|'anthropic'|'openai';
export type PaidCreativeProvider=Exclude<CreativeProvider,'ollama'>;
export interface CreativeSettings {prompt:{content:string;exists:boolean;updatedAt:string|null;fileName:string};model:string;provider:CreativeProvider;anthropicModel:string;openaiModel:string;maxOutputTokens:number;maxCostUsd:number}
export interface CreativeCapabilities {available:boolean;models:string[];selectedModel:string;reason:string;provider:CreativeProvider;endpoint:string;supports:CreativeTask[];keyConfigured?:boolean;maxCostUsd?:number;maxOutputTokens?:number}
export interface CreativeQuote {id:string;channelId:string;provider?:PaidCreativeProvider;model:string;inputTokens:number;maxOutputTokens:number;estimatedMaxCostUsd:number;costLimitUsd:number;expiresAt:string;pricingCheckedAt:string}
export interface CreativeDraft {channelId:string;task:CreativeTask;title:string;body:string;model:string;createdAt:string;status:'draft';crossChecked:false;reviewRequired:true;fields?:CreativeFields;usage?:{inputTokens:number;outputTokens:number;cachedInputTokens?:number;reasoningTokens?:number;estimatedCostUsd:number;currency:'USD'}}
