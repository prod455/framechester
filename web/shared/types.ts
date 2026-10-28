export type Platform = 'youtube' | 'tiktok' | 'instagram' | 'facebook';
export type EntityStatus = 'draft' | 'reviewed' | 'archived';
export interface Timestamped { id: string; createdAt: string; updatedAt: string }
export interface Channel extends Timestamped { name: string; description: string; niche: string; audience: string; language: string; youtubeChannelId?: string }
export interface Source { title: string; url: string; publisher: string; retrievedAt: string; license: string }
export interface WebConfig {
  dryRun: true; telemetry: false;
  render: { width: number; height: number; fps: number; crf: number; preset: string; videoCodec: 'libx264' };
  tts: { piperPath: string; voiceModel: string; voiceName: string; engine?: 'kokoro' | 'piper'; pythonPath?: string; voiceStyles?: string };
  asr: { enabled: boolean; model: string; language: string; minCoverage: number };
}
export interface Research extends Timestamped { channelId: string; title: string; niche: string; audience: string; hypothesis: string; differentiation: string; keywords: string[]; sources: Source[]; demandScore: number; competitionScore: number; feasibilityScore: number; notes: string; status: EntityStatus }
export interface ScriptScene { id: number; heading: string; narration: string; visualBrief: string; durationHintSecs: number }
export interface Claim { text: string; status: 'cited' | 'unverified' | 'contradicted'; sourceUrls: string[] }
export interface Script extends Timestamped { channelId: string; researchId?: string; topicId: string; title: string; series: string; format: 'short' | 'long'; hook: string; scenes: ScriptScene[]; sources: Source[]; claims: Claim[]; crossChecked: boolean; status: EntityStatus }
export interface Story extends Timestamped { channelId: string; scriptId?: string; title: string; hook: string; setup: string; conflict: string; turningPoint: string; resolution: string; cta: string }
export interface NetworkCapability { platform: Platform; label: string; connectionMethod: 'oauth' | 'token'; metricsAvailable: boolean; revenueAvailable: boolean; publishingAvailable: boolean; requirements: string[]; revenueNote: string; docsUrl: string }
export interface SocialConnection { channelId: string; platform: Platform; accountId: string; displayName: string; status: 'connected' | 'expired' | 'disconnected' | 'error'; connectedAt: string | null; expiresAt: string | null; scopes: string[]; message?: string }
export interface SocialSnapshot { id: string; channelId: string; platform: Platform; accountId: string; fetchedAt: string; periodStart: string; periodEnd: string; stats: { views: number | null; followers: number | null; watchMinutes: number | null; likes?: number | null }; revenue: { estimatedCents: number | null; paidCents: null; currency: string; availability: 'available' | 'unavailable' | 'missing_scope'; reason: string } }
export interface RevenueEntry extends Timestamped { channelId: string; platform: Platform; kind: 'payment' | 'estimate' | 'cost'; amountCents: number; currency: string; date: string; periodStart?: string; periodEnd?: string; note: string; source: 'manual' }
export interface WebAsset { id: string; channelId: string; name: string; kind: 'image' | 'video'; bytes: number; checksum: string; license: string; provenance: string; restrictions: string; createdAt: string; generated?: {scriptId:string;sceneId:number;fingerprint:string;captureRequired?:boolean} }
export interface PreparedVisuals { scriptId:string; assets:WebAsset[]; bindings:Record<string,string>; previews?:Record<string,string>; pending:Array<{sceneId:number;reason:string}> }
export type QaStatus = 'pass' | 'fail' | 'needs_human' | 'skipped';
export interface WebJob { id: string; channelId: string; scriptId: string; status: 'queued' | 'running' | 'needs_review' | 'completed' | 'failed' | 'blocked'; createdAt: string; startedAt?: string; finishedAt?: string; message: string; qa?: { technical: QaStatus; editorial: QaStatus }; videoAvailable: boolean }
export interface AppState { schemaVersion: 1; channels: Channel[]; config: WebConfig; channelConfigs: Record<string, WebConfig>; research: Research[]; scripts: Script[]; stories: Story[]; monetization: SocialSnapshot[]; receipts: RevenueEntry[] }
export interface Bootstrap extends AppState { csrfToken: string; connections: SocialConnection[]; capabilities: NetworkCapability[]; jobs: WebJob[]; assets: WebAsset[]; engine?: { available: boolean; message: string } }
export interface AuthStatus { configured: boolean; authenticated: boolean; csrfToken?: string }
export interface StartJobInput { scriptId: string; assetIds: Record<string, string>; asr?: boolean; burnSubtitles?: boolean }
export interface UploadAssetInput { filename: string; kind: 'image' | 'video'; contentBase64: string; license: string; provenance: string; restrictions: string }
export interface TokenConnectionInput { channelId: string; platform: Platform; accountId: string; accessToken: string; expiresAt?: string; scopes?: string[] }
export interface YoutubeOAuthInput { channelId: string; accountId: string; clientId: string; clientSecret: string; redirectUri: string }
export interface YoutubeDiscovery { query: string; queriedAt: string; source: 'youtube_data_api'; items: { videoId: string; title: string; channelTitle: string; publishedAt: string; url: string; views: number | null; likes: number | null; comments: number | null }[]; note: string }
export interface SocialApi { capabilities(): NetworkCapability[]; listConnections(channelId: string): Promise<SocialConnection[]>; connectToken(input: TokenConnectionInput): Promise<SocialConnection>; startYoutubeOAuth(input: YoutubeOAuthInput): Promise<{authorizationUrl: string; expiresAt: string}>; callbackYoutubeOAuth(input: {state: string; code: string}): Promise<SocialConnection>; sync(channelId: string, platform: Platform): Promise<SocialSnapshot>; disconnect(channelId: string, platform: Platform): Promise<void>; discoverYoutube?(channelId: string, query: string): Promise<YoutubeDiscovery> }
export interface RunnerApi { list(channelId: string): Promise<WebJob[]>; start(channelId: string, input: StartJobInput): Promise<WebJob>; assets(channelId: string): Promise<WebAsset[]>; upload(channelId: string, input: UploadAssetInput): Promise<WebAsset>; prepareVisuals(channelId:string,scriptId:string):Promise<PreparedVisuals>; assetFile(channelId:string,assetId:string):Promise<{path:string;contentType:string}|undefined>; file(channelId: string, jobId: string, file: string): Promise<{path: string; contentType: string} | undefined>; engineStatus(): {available: boolean; message: string} }
