// Mirror of crates/framechester-adapters/src/scene_layout.rs. The Rust renderer is authoritative;
// this copy rejects invalid directives at save/generation time instead of at render time.
// tests/fixtures/scene-layouts.json is shared by both test suites to keep them identical.
export const sceneLayouts = [
  'destaque',
  'pergunta',
  'numero',
  'lista',
  'comparacao',
  'linha-do-tempo',
  'citacao',
] as const;
export type SceneLayout = (typeof sceneLayouts)[number];
/** Directives of the Rust motion engine (`framechester produce`); the still renderer shows them as `destaque`. */
export const motionDirectives = [
  'fluxo',
  'grafico',
  'arquitetura',
  'codigo',
  'transformacao',
  'anotacao',
  'infografico',
  'causa',
] as const;

const maxSlot = 160,
  maxValue = 16;
export class SceneLayoutError extends Error {}
const fail = (sceneId: number, detail: string) =>
  new SceneLayoutError(`Cena ${sceneId}: diretiva visual inválida; ${detail}.`);
const length = (value: string) => [...value].length;
function slot(sceneId: number, value: string, max = maxSlot): string {
  const result = value.trim();
  if (!result || length(result) > max) throw fail(sceneId, `cada campo precisa de 1 a ${max} caracteres`);
  return result;
}
function split(sceneId: number, args: string, separator: string, min: number, max: number): string[] {
  const parts = args.split(separator);
  if (parts.length < min || parts.length > max)
    throw fail(
      sceneId,
      min === max
        ? `use exatamente ${min} campos separados por '${separator}'`
        : `informe de ${min} a ${max} itens separados por '${separator}'`,
    );
  return parts;
}
function pair(sceneId: number, args: string): [string, string] {
  const parts = split(sceneId, args, '|', 2, 2);
  return [slot(sceneId, parts[0]!), slot(sceneId, parts[1]!)];
}
function items(sceneId: number, args: string): string[] {
  return split(sceneId, args, ';', 2, 5).map((item) => slot(sceneId, item));
}
function entry(sceneId: number, value: string): void {
  const at = value.indexOf(':');
  if (at < 0) throw fail(sceneId, "cada item precisa do formato 'rotulo: texto'");
  slot(sceneId, value.slice(0, at), 40);
  slot(sceneId, value.slice(at + 1));
}
const normalized = (value: string) => value.split(/\s+/).filter(Boolean).join(' ').toLowerCase();
function spoken(sceneId: number, value: string, narration: string, what: string): void {
  if (!normalized(narration).includes(normalized(value)))
    throw fail(sceneId, `${what} '${value}' precisa aparecer na narração da cena`);
}

/**
 * Returns the layout declared on the first line of `visualBrief`, or throws SceneLayoutError.
 * `sceneNumber` is the number the operator sees (editor label or position), not the raw id;
 * the Rust CLI reports the raw `scene_id` from its JSON plan instead.
 */
export function parseSceneLayout(sceneNumber: number, visualBrief: string, narration: string): SceneLayout {
  const first = (visualBrief.split('\n')[0] ?? '').trim();
  // `# Titulo` (Markdown) is a free note; a directive starts with a letter.
  if (!/^#\p{Alphabetic}/u.test(first)) return 'destaque';
  const directive = first.slice(1),
    space = directive.search(/\s/);
  const name = space < 0 ? directive : directive.slice(0, space),
    args = space < 0 ? '' : directive.slice(space).trim();
  switch (name) {
    case 'destaque':
      if (args) throw fail(sceneNumber, '#destaque não recebe campos');
      return name;
    case 'pergunta':
      slot(sceneNumber, args);
      return name;
    case 'numero': {
      const [value] = pair(sceneNumber, args);
      if (length(value) > maxValue || !/[0-9]/.test(value))
        throw fail(sceneNumber, `o valor precisa conter um dígito e até ${maxValue} caracteres`);
      spoken(sceneNumber, value, narration, 'o valor');
      return name;
    }
    case 'lista':
      items(sceneNumber, args);
      return name;
    case 'comparacao':
      split(sceneNumber, args, '|', 2, 2).forEach((side) => entry(sceneNumber, side));
      return name;
    case 'linha-do-tempo':
      split(sceneNumber, args, ';', 2, 5).forEach((item) => entry(sceneNumber, item));
      return name;
    case 'citacao': {
      const [quote] = pair(sceneNumber, args);
      spoken(sceneNumber, quote, narration, 'a citação');
      return name;
    }
    default:
      if ((motionDirectives as readonly string[]).includes(name)) return 'destaque';
      throw fail(
        sceneNumber,
        `'#${name}' não existe; use ${sceneLayouts.join(', ')} ou uma diretiva do motor motion (${motionDirectives.join(', ')})`,
      );
  }
}

/** The layout a scene renders with: an invalid directive becomes a free note and the scene uses `destaque`. */
export function sceneLayoutOrFallback(
  sceneNumber: number,
  visualBrief: string,
  narration: string,
): { layout: SceneLayout; problem?: string } {
  try {
    return { layout: parseSceneLayout(sceneNumber, visualBrief, narration) };
  } catch (error) {
    if (error instanceof SceneLayoutError) return { layout: 'destaque', problem: error.message };
    throw error;
  }
}

/** Grammar given to the model and shown in the editor; docs/GUIA_VISUAL.md explains each layout. */
export const sceneLayoutGrammar = `Primeira linha opcional de visualBrief, uma diretiva por cena (o restante do visualBrief é nota livre):
#pergunta TEXTO — pergunta grande; use no gancho ou para abrir um loop.
#numero VALOR | LEGENDA — VALOR com dígito, até 16 caracteres, dito literalmente na narração da mesma cena.
#lista A; B; C — 2 a 5 passos ou itens curtos.
#comparacao RÓTULO: texto | RÓTULO: texto — dois lados.
#linha-do-tempo MARCO: texto; MARCO: texto — 2 a 5 marcos em ordem.
#citacao FRASE | ATRIBUIÇÃO — FRASE dita literalmente na narração; só citação documentada nas fontes.
Sem diretiva — título da cena e trecho da narração; não escreva #destaque.
Diretivas animadas do motor motion (framechester produce), quando o vídeo for renderizado por ele:
#fluxo A -> B -> C (-> loop fecha o ciclo) — diagrama de fluxo animado.
#grafico TÍTULO | rótulo=valor; rótulo=valor — barras e contadores; valores ditos na narração.
#arquitetura Camada/Caixa; Camada/Caixa2; Caixa -> Caixa2 — arquitetura em camadas.
#codigo linguagem | arquivo (linhas de código nas linhas seguintes) — demonstração de código.
#transformacao A; B => C — objetos que viram outros.
#anotacao pasta/arquivo: nota; … — árvore com anotações.
#infografico TÍTULO | rótulo=valor: detalhe; … — cartões de dados.
#causa A => B => C — causa e consequência.
Cada campo tem até 160 caracteres. Não use outras diretivas.
Toda cena vira composição gerada localmente: não peça gravação real, gravação de tela, captura de tela nem CAPTURA PENDENTE.`;
