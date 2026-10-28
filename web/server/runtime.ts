import {isAbsolute} from 'node:path';
import {localPort} from '../shared/local-port.ts';

export class InvalidRuntimeConfiguration extends Error {}
function filePath(value:string|undefined):string|undefined {
 if(value===undefined)return undefined;
 if(!value||value.includes('\0')||!isAbsolute(value))throw new InvalidRuntimeConfiguration('Caminhos de infraestrutura devem ser absolutos e válidos.');
 return value;
}
/** Native operation remains loopback-only. Container ingress must be published on host loopback. */
export function runtimeConfiguration(environment:NodeJS.ProcessEnv,containerDetected=false){
 const container=environment.FRAMECHESTER_CONTAINER==='1';
 if(environment.FRAMECHESTER_CONTAINER!==undefined&&!container)throw new InvalidRuntimeConfiguration('Modo de contêiner inválido.');
 if(container&&!containerDetected)throw new InvalidRuntimeConfiguration('O modo de contêiner requer uma execução Docker detectada.');
 if(environment.FRAMECHESTER_WEB_PUBLIC_PORT!==undefined&&!container)throw new InvalidRuntimeConfiguration('Porta publicada é exclusiva da execução em contêiner.');
 const publicPort=environment.FRAMECHESTER_WEB_PUBLIC_PORT===undefined?undefined:localPort(environment.FRAMECHESTER_WEB_PUBLIC_PORT);
 const vaultKeyFile=filePath(environment.FRAMECHESTER_VAULT_KEY_FILE);
 if(container&&!vaultKeyFile)throw new InvalidRuntimeConfiguration('O contêiner exige um arquivo externo para a chave do cofre.');
 return {host:container?'0.0.0.0' as const:'127.0.0.1' as const,publicPort,vaultKeyFile,privateRoot:filePath(environment.FRAMECHESTER_PRIVATE_ROOT),engineBinary:filePath(environment.FRAMECHESTER_ENGINE_BINARY)};
}
