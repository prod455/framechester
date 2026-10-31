//! Deterministic storyboard planner: turns a reviewed `Script` into a `Storyboard`.
//!
//! The script author (a person or a model) declares *what* each scene shows with one
//! directive on the first line of `visual_brief`; this module turns it into a typed
//! composition and plans the animation events against the narration: an object is
//! revealed when its label is first spoken and highlighted while it is discussed, and
//! objects nobody mentions are spread across the narration segments. The renderer
//! decides the look; nothing here is a coordinate or an FFmpeg command.
//!
//! Directive grammar (`docs/STORYBOARD.md`):
//!
//! | Directive | Composition |
//! |---|---|
//! | `#pergunta TEXTO` / `#destaque` / `#citacao FRASE \| AUTOR` | title |
//! | `#fluxo A -> B -> C` (`-> loop` closes the cycle) | flow_diagram |
//! | `#comparacao L: a; b \| R: c; d` | comparison |
//! | `#linha-do-tempo MARCO: texto; …` | timeline |
//! | `#grafico TITULO \| rotulo=valor[unidade]; …` / `#numero VALOR \| LEGENDA` | chart |
//! | `#arquitetura Camada/Caixa; Camada/Caixa2; Caixa -> Caixa2` | architecture |
//! | `#codigo linguagem [\| arquivo]` + following lines | code |
//! | `#transformacao a; b => c; d` | transformation |
//! | `#anotacao pasta/arquivo: nota; …` | annotation |
//! | `#infografico TITULO \| rotulo=valor: detalhe; …` | infographic |
//! | `#causa A => B => C` / `#lista A; B; C` | cause_effect |
//!
//! Every label may carry an icon (`[agent]`) and a role (`{primary}`) suffix.
use crate::domain::{Scene, Script};
use crate::error::{FramechesterError, Result};
use crate::narration::segment_narration;
use crate::storyboard::{
    narration_words, Animation, CaptionPlan, Character, Composition, Cue, Easing, Icon, Motion,
    Pose, Relation, RelationKind, Role, Storyboard, StoryboardScene, Transition,
    ValidationCriteria, VideoFormat, VisualObject, SCHEMA_VERSION,
};

const MAX_FIELD: usize = 160;

fn invalid(scene_id: u32, detail: impl std::fmt::Display) -> FramechesterError {
    FramechesterError::InvalidInput(format!(
        "cena {scene_id}: diretiva visual invalida; {detail}"
    ))
}

/// The directive line and the free note after it.
pub fn split_brief(visual_brief: &str) -> (Option<(&str, &str)>, &str) {
    let mut lines = visual_brief.lines();
    let first = lines.next().unwrap_or("").trim();
    let rest_start = visual_brief
        .find('\n')
        .map(|at| at + 1)
        .unwrap_or(visual_brief.len());
    let rest = &visual_brief[rest_start..];
    let Some(directive) = first
        .strip_prefix('#')
        .filter(|rest| rest.starts_with(char::is_alphabetic))
    else {
        return (None, visual_brief);
    };
    let (name, args) = directive
        .split_once(char::is_whitespace)
        .unwrap_or((directive, ""));
    (Some((name, args.trim())), rest)
}

fn slug(text: &str, fallback: usize) -> String {
    let slug: String = text
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .take(3)
        .collect::<Vec<_>>()
        .join("-");
    if slug.is_empty() {
        format!("obj-{fallback}")
    } else {
        slug
    }
}

fn parse_icon(name: &str) -> Option<Icon> {
    Some(match name {
        "agent" | "agente" => Icon::Agent,
        "skill" => Icon::Skill,
        "folder" | "pasta" => Icon::Folder,
        "file" | "arquivo" => Icon::File,
        "tool" | "ferramenta" => Icon::Tool,
        "loop" => Icon::Loop,
        "check" => Icon::Check,
        "cross" | "x" => Icon::Cross,
        "bolt" | "raio" => Icon::Bolt,
        "brain" | "cerebro" => Icon::Brain,
        "gear" | "engrenagem" => Icon::Gear,
        "database" | "banco" => Icon::Database,
        "cloud" | "nuvem" => Icon::Cloud,
        "user" | "usuario" => Icon::User,
        "clock" | "relogio" => Icon::Clock,
        "chart" | "grafico" => Icon::Chart,
        "shield" | "escudo" => Icon::Shield,
        "search" | "busca" => Icon::Search,
        "arrow" | "seta" => Icon::Arrow,
        "question" | "pergunta" => Icon::Question,
        "code" | "codigo" => Icon::Code,
        "book" | "livro" => Icon::Book,
        _ => return None,
    })
}

fn parse_character(name: &str) -> Option<Character> {
    Some(match name {
        "presenter" | "apresentador" | "apresentadora" => Character::Presenter,
        "developer" | "dev" | "programador" | "programadora" => Character::Developer,
        "scientist" | "cientista" => Character::Scientist,
        "robot" | "robo" | "robô" => Character::Robot,
        _ => return None,
    })
}

fn parse_pose(name: &str) -> Option<Pose> {
    Some(match name {
        "explain" | "explicar" => Pose::Explain,
        "point" | "apontar" => Pose::Point,
        "think" | "pensar" => Pose::Think,
        "celebrate" | "comemorar" => Pose::Celebrate,
        _ => return None,
    })
}

/// The cast that fits the topic: the first match in priority order, else the presenter.
pub fn cast_for(script: &Script) -> Character {
    let words = narration_words(&format!(
        "{} {} {}",
        script.title, script.hook, script.series
    ));
    let has = |stems: &[&str]| {
        words.iter().any(|word| {
            let word = fold(word);
            stems.iter().any(|stem| {
                if stem.len() <= 3 {
                    word == *stem
                } else {
                    word.starts_with(stem)
                }
            })
        })
    };
    if has(&[
        "ia", "ai", "llm", "gpt", "agente", "robo", "automac", "chatbot", "claude",
    ]) {
        Character::Robot
    } else if has(&[
        "codigo", "program", "software", "dev", "api", "skill", "deploy", "bug", "git",
    ]) {
        Character::Developer
    } else if has(&[
        "pesquis",
        "estudo",
        "cienc",
        "cientist",
        "experiment",
        "laborat",
        "fisic",
        "quimic",
        "biolog",
        "astronom",
    ]) {
        Character::Scientist
    } else {
        Character::Presenter
    }
}

fn fold(word: &str) -> String {
    word.chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ã' => 'a',
            'é' | 'ê' => 'e',
            'í' => 'i',
            'ó' | 'ô' | 'õ' => 'o',
            'ú' | 'ü' => 'u',
            'ç' => 'c',
            other => other,
        })
        .collect()
}

/// Body language for a scene without a directive: questions think, the closing scene
/// celebrates, the rest alternate explaining and pointing.
fn pose_for(heading: &str, index: usize, total: usize) -> Pose {
    if heading.trim_end().ends_with('?') {
        Pose::Think
    } else if total > 1 && index + 1 == total {
        Pose::Celebrate
    } else if index % 2 == 0 {
        Pose::Explain
    } else {
        Pose::Point
    }
}

/// Characters the script describes in words, in order of first appearance: the folded name
/// and the full `Nome (traços)` spec.
fn described_cast(script: &Script) -> Vec<(String, String)> {
    let mut cast: Vec<(String, String)> = Vec::new();
    for scene in &script.scenes {
        if let (Some(("personagem", args)), _) = split_brief(&scene.visual_brief) {
            let who = args.split('|').next().unwrap_or("").trim();
            if let (Some(open), true) = (who.find('('), who.ends_with(')')) {
                let key = crate::persona::key(&who[..open]);
                if !key.is_empty() && !cast.iter().any(|(existing, _)| *existing == key) {
                    cast.push((key, who.to_string()));
                }
            }
        }
    }
    cast
}

fn character_name(character: Character) -> &'static str {
    match character {
        Character::Presenter => "apresentador",
        Character::Developer => "dev",
        Character::Scientist => "cientista",
        Character::Robot => "robo",
    }
}

fn pose_name(pose: Pose) -> &'static str {
    match pose {
        Pose::Explain => "explicar",
        Pose::Point => "apontar",
        Pose::Think => "pensar",
        Pose::Celebrate => "comemorar",
    }
}

fn parse_role(name: &str) -> Option<Role> {
    Some(match name {
        "neutral" | "neutro" => Role::Neutral,
        "primary" | "primario" => Role::Primary,
        "secondary" | "secundario" => Role::Secondary,
        "accent" | "acento" => Role::Accent,
        "success" | "sucesso" => Role::Success,
        "warning" | "alerta" => Role::Warning,
        "danger" | "perigo" => Role::Danger,
        _ => return None,
    })
}

/// Parses `Label [icon] {role}` and an optional `: detail`.
fn parse_object(scene_id: u32, raw: &str, index: usize) -> Result<VisualObject> {
    let mut text = raw.trim().to_string();
    let mut icon = None;
    let mut role = Role::Neutral;
    while let Some(open) = text.rfind(['[', '{']) {
        let closing = if text[open..].starts_with('[') {
            ']'
        } else {
            '}'
        };
        let Some(close) = text[open..].find(closing) else {
            break;
        };
        let token = text[open + 1..open + close].trim().to_lowercase();
        if closing == ']' {
            icon = parse_icon(&token)
                .map(Some)
                .ok_or_else(|| invalid(scene_id, format!("icone '{token}' nao existe")))?;
        } else {
            role = parse_role(&token)
                .ok_or_else(|| invalid(scene_id, format!("papel '{token}' nao existe")))?;
        }
        text.replace_range(open..open + close + 1, "");
        text = text.trim().to_string();
    }
    let (label, detail) = match text.split_once(':') {
        Some((label, detail)) if !detail.trim().is_empty() => {
            (label.trim().to_string(), Some(detail.trim().to_string()))
        }
        _ => (text.trim().to_string(), None),
    };
    if label.is_empty() || label.chars().count() > MAX_FIELD {
        return Err(invalid(
            scene_id,
            format!("cada campo precisa de 1 a {MAX_FIELD} caracteres"),
        ));
    }
    Ok(VisualObject {
        id: slug(&label, index),
        label,
        detail,
        role,
        icon,
        value: None,
        unit: None,
        group: None,
        parent: None,
    })
}

/// `rotulo=valor[unidade]` with an optional `: detail`. Icon and role tokens may appear
/// anywhere in the item.
fn parse_valued(scene_id: u32, raw: &str, index: usize) -> Result<VisualObject> {
    let mut tokens = String::new();
    let mut raw = raw.to_string();
    while let Some(open) = raw.rfind(['[', '{']) {
        let closing = if raw[open..].starts_with('[') {
            ']'
        } else {
            '}'
        };
        let Some(close) = raw[open..].find(closing) else {
            break;
        };
        tokens.push(' ');
        tokens.push_str(&raw[open..open + close + 1]);
        raw.replace_range(open..open + close + 1, "");
    }
    let raw = raw.trim();
    let (label_part, value_part) = raw
        .split_once('=')
        .ok_or_else(|| invalid(scene_id, "use rotulo=valor para cada item"))?;
    let (value_text, detail) = match value_part.split_once(':') {
        Some((value, detail)) => (value.trim(), Some(detail.trim().to_string())),
        None => (value_part.trim(), None),
    };
    let digits: String = value_text
        .chars()
        .take_while(|c| c.is_ascii_digit() || matches!(c, '.' | ',' | '-'))
        .collect();
    let unit = value_text[digits.len()..].trim();
    let value: f64 = digits
        .replace('.', "")
        .replace(',', ".")
        .parse()
        .map_err(|_| invalid(scene_id, format!("valor '{value_text}' nao e numerico")))?;
    let mut object = parse_object(scene_id, &format!("{label_part}{tokens}"), index)?;
    object.value = Some(value);
    object.unit = (!unit.is_empty()).then(|| unit.to_string());
    if detail.is_some() {
        object.detail = detail;
    }
    Ok(object)
}

fn unique_ids(objects: &mut [VisualObject]) {
    let mut seen = std::collections::HashMap::new();
    for object in objects.iter_mut() {
        let count = seen.entry(object.id.clone()).or_insert(0usize);
        if *count > 0 {
            object.id = format!("{}-{}", object.id, *count + 1);
        }
        *count += 1;
    }
}

fn list(scene_id: u32, args: &str, separator: char, min: usize, max: usize) -> Result<Vec<String>> {
    let parts: Vec<String> = args
        .split(separator)
        .map(|part| part.trim().to_string())
        .filter(|part| !part.is_empty())
        .collect();
    if parts.len() < min || parts.len() > max {
        return Err(invalid(
            scene_id,
            format!("informe de {min} a {max} itens separados por '{separator}'"),
        ));
    }
    Ok(parts)
}

/// Parses the directive of a scene into its composition. Code lines come from the
/// rest of the brief. A brief without a directive becomes a title with the heading.
pub fn parse_composition(scene: &Scene) -> Result<Composition> {
    let id = scene.id;
    let (directive, rest) = split_brief(&scene.visual_brief);
    let Some((name, args)) = directive else {
        return Ok(Composition::Title {
            text: scene.heading.clone(),
            kicker: None,
        });
    };
    let composition = match name {
        "destaque" => Composition::Title {
            text: scene.heading.clone(),
            kicker: None,
        },
        "pergunta" => {
            if args.is_empty() || args.chars().count() > 140 {
                return Err(invalid(id, "#pergunta exige de 1 a 140 caracteres"));
            }
            Composition::Title {
                text: args.to_string(),
                kicker: Some("Pergunta".into()),
            }
        }
        "citacao" => {
            let parts = list(id, args, '|', 2, 2)?;
            Composition::Title {
                text: format!("“{}”", parts[0]),
                kicker: Some(format!("— {}", parts[1])),
            }
        }
        "numero" => {
            let parts = list(id, args, '|', 2, 2)?;
            let object = parse_valued(id, &format!("{}={}", parts[1], parts[0]), 0)?;
            Composition::Chart {
                title: scene.heading.clone(),
                objects: vec![object],
                max_value: None,
            }
        }
        "fluxo" => {
            let mut looped = false;
            let mut names: Vec<String> = list(id, args, '>', 2, 8)?
                .into_iter()
                .map(|part| part.trim_end_matches('-').trim().to_string())
                .collect();
            if names.last().is_some_and(|last| last.eq_ignore_ascii_case("loop")) {
                names.pop();
                looped = true;
            }
            let mut objects = names
                .iter()
                .enumerate()
                .map(|(index, name)| parse_object(id, name, index))
                .collect::<Result<Vec<_>>>()?;
            unique_ids(&mut objects);
            let relations = objects
                .windows(2)
                .map(|pair| Relation {
                    from: pair[0].id.clone(),
                    to: pair[1].id.clone(),
                    kind: RelationKind::Flow,
                    label: None,
                })
                .collect();
            Composition::FlowDiagram {
                objects,
                relations,
                looped,
            }
        }
        "comparacao" => {
            let sides = list(id, args, '|', 2, 2)?;
            let mut titles = Vec::new();
            let mut objects = Vec::new();
            for (side, raw) in sides.iter().enumerate() {
                let (title, items) = raw
                    .split_once(':')
                    .ok_or_else(|| invalid(id, "cada lado precisa do formato 'rotulo: itens'"))?;
                let title = title.trim();
                if title.is_empty() || title.chars().count() > 40 {
                    return Err(invalid(id, "rotulo de 1 a 40 caracteres"));
                }
                titles.push(title.to_string());
                for (index, item) in list(id, items, ';', 1, 5)?.iter().enumerate() {
                    let mut object = parse_object(id, item, side * 10 + index)?;
                    object.group = Some(if side == 0 { "left" } else { "right" }.into());
                    if object.role == Role::Neutral {
                        object.role = if side == 0 { Role::Primary } else { Role::Secondary };
                    }
                    objects.push(object);
                }
            }
            unique_ids(&mut objects);
            Composition::Comparison {
                left_title: titles[0].clone(),
                right_title: titles[1].clone(),
                objects,
            }
        }
        "linha-do-tempo" => {
            let mut objects = Vec::new();
            for (index, item) in list(id, args, ';', 2, 8)?.iter().enumerate() {
                let (label, text) = item
                    .split_once(':')
                    .ok_or_else(|| invalid(id, "cada marco precisa do formato 'marco: texto'"))?;
                let mut object = parse_object(id, text, index)?;
                object.detail = Some(object.label.clone());
                object.label = label.trim().to_string();
                objects.push(object);
            }
            unique_ids(&mut objects);
            Composition::Timeline { objects }
        }
        "grafico" => {
            let parts = list(id, args, '|', 2, 2)?;
            let mut objects = list(id, &parts[1], ';', 1, 8)?
                .iter()
                .enumerate()
                .map(|(index, item)| parse_valued(id, item, index))
                .collect::<Result<Vec<_>>>()?;
            unique_ids(&mut objects);
            Composition::Chart {
                title: parts[0].clone(),
                objects,
                max_value: None,
            }
        }
        "arquitetura" => {
            let mut objects = Vec::new();
            let mut relations = Vec::new();
            for (index, item) in list(id, args, ';', 1, 24)?.iter().enumerate() {
                if let Some((from, to)) = item.split_once("->") {
                    relations.push((from.trim().to_string(), to.trim().to_string()));
                    continue;
                }
                let (layer, name) = item
                    .split_once('/')
                    .map(|(layer, name)| (Some(layer.trim().to_string()), name))
                    .unwrap_or((None, item));
                let mut object = parse_object(id, name, index)?;
                object.group = layer;
                objects.push(object);
            }
            unique_ids(&mut objects);
            let find = |label: &str| {
                objects
                    .iter()
                    .find(|object| object.label.eq_ignore_ascii_case(label) || object.id == slug(label, usize::MAX))
                    .map(|object| object.id.clone())
                    .ok_or_else(|| invalid(id, format!("ligacao usa caixa '{label}' inexistente")))
            };
            let relations = relations
                .iter()
                .map(|(from, to)| {
                    Ok(Relation {
                        from: find(from)?,
                        to: find(to)?,
                        kind: RelationKind::Uses,
                        label: None,
                    })
                })
                .collect::<Result<Vec<_>>>()?;
            Composition::Architecture { objects, relations }
        }
        "codigo" => {
            let parts = list(id, args, '|', 1, 2)?;
            let lines: Vec<String> = rest
                .lines()
                .map(|line| line.trim_end().to_string())
                .skip_while(|line| line.trim().is_empty())
                .collect();
            let lines: Vec<String> = {
                let mut trimmed = lines;
                while trimmed.last().is_some_and(|line| line.trim().is_empty()) {
                    trimmed.pop();
                }
                trimmed
            };
            if lines.is_empty() {
                return Err(invalid(id, "#codigo exige linhas de codigo abaixo da diretiva"));
            }
            Composition::Code {
                language: parts[0].to_lowercase(),
                lines,
                file_name: parts.get(1).cloned(),
            }
        }
        "transformacao" => {
            let (before, after) = args
                .split_once("=>")
                .ok_or_else(|| invalid(id, "use 'antes => depois'"))?;
            let mut before = list(id, before, ';', 1, 6)?
                .iter()
                .enumerate()
                .map(|(index, item)| parse_object(id, item, index))
                .collect::<Result<Vec<_>>>()?;
            let mut after = list(id, after, ';', 1, 6)?
                .iter()
                .enumerate()
                .map(|(index, item)| parse_object(id, item, 100 + index))
                .collect::<Result<Vec<_>>>()?;
            for object in &mut after {
                object.id = format!("depois-{}", object.id);
                if object.role == Role::Neutral {
                    object.role = Role::Secondary;
                }
            }
            for object in &mut before {
                object.id = format!("antes-{}", object.id);
            }
            unique_ids(&mut before);
            unique_ids(&mut after);
            Composition::Transformation {
                before,
                after,
                label: None,
            }
        }
        "anotacao" => {
            let mut objects: Vec<VisualObject> = Vec::new();
            let mut notes = Vec::new();
            for (index, item) in list(id, args, ';', 1, 16)?.iter().enumerate() {
                let (path, note) = match item.split_once(':') {
                    Some((path, note)) => (path.trim(), Some(note.trim().to_string())),
                    None => (item.trim(), None),
                };
                let mut parent: Option<String> = None;
                let segments: Vec<&str> = path.split('/').map(str::trim).filter(|s| !s.is_empty()).collect();
                if segments.is_empty() {
                    return Err(invalid(id, "caminho vazio"));
                }
                for (depth, segment) in segments.iter().enumerate() {
                    let is_leaf = depth + 1 == segments.len();
                    let existing = objects
                        .iter()
                        .find(|object| object.label == *segment && object.parent == parent)
                        .map(|object| object.id.clone());
                    let object_id = match existing {
                        Some(existing) => existing,
                        None => {
                            let mut object = parse_object(id, segment, index * 4 + depth)?;
                            object.parent = parent.clone();
                            object.icon = object.icon.or(Some(if is_leaf && segment.contains('.') {
                                Icon::File
                            } else {
                                Icon::Folder
                            }));
                            unique_ids_push(&mut objects, object)
                        }
                    };
                    if is_leaf {
                        if let Some(note) = &note {
                            objects
                                .iter_mut()
                                .find(|object| object.id == object_id)
                                .expect("just inserted")
                                .detail = Some(note.clone());
                            notes.push(Relation {
                                from: object_id.clone(),
                                to: object_id.clone(),
                                kind: RelationKind::Contains,
                                label: Some(note.clone()),
                            });
                        }
                    }
                    parent = Some(object_id);
                }
            }
            Composition::Annotation { objects, notes }
        }
        "infografico" => {
            let parts = list(id, args, '|', 2, 2)?;
            let mut objects = list(id, &parts[1], ';', 1, 6)?
                .iter()
                .enumerate()
                .map(|(index, item)| {
                    if item.contains('=') {
                        parse_valued(id, item, index)
                    } else {
                        parse_object(id, item, index)
                    }
                })
                .collect::<Result<Vec<_>>>()?;
            unique_ids(&mut objects);
            Composition::Infographic {
                title: parts[0].clone(),
                objects,
            }
        }
        "personagem" => {
            let parts: Vec<&str> = args.split('|').map(str::trim).collect();
            if parts.len() < 2 || parts.len() > 3 {
                return Err(invalid(id, "use #personagem PERSONAGEM | POSE | FALA (fala opcional)"));
            }
            // A preset by name, or a character described in words: `Nome (traço, traço)`.
            let persona = crate::persona::parse(parts[0]).map_err(|detail| invalid(id, detail))?;
            let character = match &persona {
                Some(_) => Character::Presenter,
                None => parse_character(&parts[0].to_lowercase()).ok_or_else(|| {
                    invalid(id, format!("personagem '{}' nao existe; use apresentador, dev, cientista, robo ou descreva: Nome (careca, barba longa, toga)", parts[0]))
                })?,
            };
            let pose = parse_pose(&parts[1].to_lowercase()).ok_or_else(|| {
                invalid(id, format!("pose '{}' nao existe; use explicar, apontar, pensar ou comemorar", parts[1]))
            })?;
            let text = parts.get(2).filter(|text| !text.is_empty()).map_or(scene.heading.as_str(), |text| text);
            if text.chars().count() > 140 {
                return Err(invalid(id, "a fala do personagem passa de 140 caracteres"));
            }
            Composition::Character {
                character,
                pose,
                text: text.to_string(),
                persona,
            }
        }
        "causa" | "lista" => {
            let separator = if name == "causa" { "=>" } else { ";" };
            let items: Vec<&str> = args.split(separator).map(str::trim).filter(|s| !s.is_empty()).collect();
            if items.len() < 2 || items.len() > 8 {
                return Err(invalid(id, format!("informe de 2 a 8 itens separados por '{separator}'")));
            }
            let mut objects = items
                .iter()
                .enumerate()
                .map(|(index, item)| parse_object(id, item, index))
                .collect::<Result<Vec<_>>>()?;
            unique_ids(&mut objects);
            Composition::CauseEffect { objects }
        }
        other => {
            return Err(invalid(
                id,
                format!("'#{other}' nao existe; use pergunta, destaque, citacao, numero, fluxo, comparacao, linha-do-tempo, grafico, arquitetura, codigo, transformacao, anotacao, infografico, causa, lista ou personagem"),
            ))
        }
    };
    Ok(composition)
}

fn unique_ids_push(objects: &mut Vec<VisualObject>, mut object: VisualObject) -> String {
    let base = object.id.clone();
    let mut suffix = 1;
    while objects.iter().any(|existing| existing.id == object.id) {
        suffix += 1;
        object.id = format!("{base}-{suffix}");
    }
    let id = object.id.clone();
    objects.push(object);
    id
}

/// Significant words of a label that may be looked up in the narration.
fn label_words(label: &str) -> Vec<String> {
    narration_words(label)
        .into_iter()
        .filter(|word| word.chars().count() >= 4)
        .collect()
}

/// Words shared by two or more labels of the same composition ("skill", "agente"); they
/// identify no object in particular and are only used as a last resort.
fn shared_words(labels: &[String]) -> Vec<String> {
    let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for label in labels {
        let mut seen = Vec::new();
        for word in label_words(label) {
            let key = stem(&word);
            if !seen.contains(&key) {
                seen.push(key.clone());
                *counts.entry(key).or_insert(0) += 1;
            }
        }
    }
    counts
        .into_iter()
        .filter(|(_, count)| *count > 1)
        .map(|(word, _)| word)
        .collect()
}

/// Position of the first narration word (at or after `min_position`, not yet used) that
/// matches a distinctive word of the label; shared words only when nothing else matches.
fn mention(
    label: &str,
    narration_words: &[String],
    used: &mut Vec<usize>,
    min_position: usize,
    shared: &[String],
) -> Option<usize> {
    let mut candidates = label_words(label);
    // Longer words are more specific: try them first.
    candidates.sort_by_key(|word| std::cmp::Reverse(word.chars().count()));
    let (distinctive, generic): (Vec<String>, Vec<String>) = candidates
        .into_iter()
        .partition(|word| !shared.contains(&stem(word)));
    for group in [distinctive, generic] {
        if group.is_empty() {
            continue;
        }
        let found = narration_words
            .iter()
            .enumerate()
            .skip(min_position)
            .find(|(position, word)| {
                !used.contains(position)
                    && group.iter().any(|candidate| stem(candidate) == stem(word))
            })
            .map(|(position, _)| position);
        if let Some(position) = found {
            used.push(position);
            return Some(position);
        }
    }
    None
}

fn word_cue(narration_words: &[String], position: usize) -> Cue {
    let word = narration_words[position].clone();
    let occurrence = narration_words[..position]
        .iter()
        .filter(|other| **other == word)
        .count();
    Cue::Word { word, occurrence }
}

/// Crude Portuguese stem so "decide" matches "decisão" and "skills" matches "skill".
fn stem(word: &str) -> String {
    let mut stem: String = word.chars().take(5).collect();
    while stem.ends_with(['s', 'a', 'o', 'e']) && stem.chars().count() > 4 {
        stem.pop();
    }
    stem
}

/// Plans the animations of a scene: reveal on first mention (or spread over segments),
/// highlight on mention, draw edges after both ends exist, and a breathing drift so the
/// frame never stands still.
pub fn plan_animations(composition: &Composition, narration: &str) -> Vec<Animation> {
    let words = narration_words(narration);
    let segments = segment_narration(narration).len().max(1);
    let mut animations = Vec::new();
    let mut used = Vec::new();
    let labels: Vec<(String, String)> = match composition {
        Composition::Title { .. } => vec![("title".into(), String::new())],
        Composition::Character { .. } => vec![("speech".into(), String::new())],
        Composition::Code { lines, .. } => (0..lines.len())
            .map(|index| (format!("line:{index}"), String::new()))
            .collect(),
        Composition::FlowDiagram { objects, .. }
        | Composition::Comparison { objects, .. }
        | Composition::Timeline { objects }
        | Composition::Chart { objects, .. }
        | Composition::Architecture { objects, .. }
        | Composition::Annotation { objects, .. }
        | Composition::Infographic { objects, .. }
        | Composition::CauseEffect { objects } => objects
            .iter()
            .map(|object| (object.id.clone(), object.label.clone()))
            .collect(),
        Composition::Transformation { before, after, .. } => before
            .iter()
            .chain(after.iter())
            .map(|object| (object.id.clone(), object.label.clone()))
            .collect(),
    };
    let count = labels.len().max(1);
    let is_transformation = matches!(composition, Composition::Transformation { .. });
    // Sequences (steps, flows, timelines, trees) must appear in order even when the
    // narration mentions a later step first; comparisons and infographics are free.
    let sequential = matches!(
        composition,
        Composition::FlowDiagram { .. }
            | Composition::Timeline { .. }
            | Composition::CauseEffect { .. }
            | Composition::Annotation { .. }
            | Composition::Architecture { .. }
    );
    let before_count = match composition {
        Composition::Transformation { before, .. } => before.len(),
        _ => 0,
    };
    let shared = shared_words(
        &labels
            .iter()
            .map(|(_, label)| label.clone())
            .collect::<Vec<_>>(),
    );
    let mut last_position = 0usize;
    for (index, (id, label)) in labels.iter().enumerate() {
        let motion = match composition {
            Composition::Chart { .. } => Motion::Grow,
            Composition::Code { .. } => Motion::Type,
            Composition::FlowDiagram { .. } | Composition::Architecture { .. } => Motion::Pop,
            _ => Motion::Reveal,
        };
        let spread = Cue::Segment {
            index: (index * segments / count).min(segments - 1),
        };
        let at = if index == 0 {
            Cue::Start
        } else if is_transformation && index >= before_count {
            // "Before" objects enter together; "after" objects enter in the second half.
            Cue::Fraction {
                fraction: 0.5
                    + 0.35 * (index - before_count) as f32 / (count - before_count).max(1) as f32,
            }
        } else if is_transformation {
            Cue::Fraction {
                fraction: 0.04 + 0.06 * index as f32,
            }
        } else {
            let min_position = if sequential { last_position + 1 } else { 0 };
            match mention(label, &words, &mut used, min_position, &shared) {
                Some(position) => {
                    last_position = last_position.max(position);
                    word_cue(&words, position)
                }
                None if sequential && !words.is_empty() => {
                    // Keep the order: step forward through the remaining narration.
                    let remaining_objects = (count - index).max(1);
                    let remaining_words = words.len().saturating_sub(last_position + 1);
                    let position = (last_position + 1 + remaining_words / (remaining_objects + 1))
                        .min(words.len() - 1);
                    last_position = position;
                    word_cue(&words, position)
                }
                None => spread,
            }
        };
        animations.push(Animation {
            target: id.clone(),
            motion,
            at: at.clone(),
            duration_secs: 0.55,
            easing: if motion == Motion::Pop {
                Easing::Back
            } else {
                Easing::EaseOut
            },
            destination: None,
        });
        if matches!(at, Cue::Word { .. }) && !is_transformation {
            animations.push(Animation {
                target: id.clone(),
                motion: Motion::Highlight,
                at,
                duration_secs: 1.2,
                easing: Easing::EaseOut,
                destination: None,
            });
        }
    }
    if is_transformation {
        let before_ids: Vec<&str> = labels
            .iter()
            .take(before_count)
            .map(|(id, _)| id.as_str())
            .collect();
        let after_ids: Vec<&str> = labels
            .iter()
            .skip(before_count)
            .map(|(id, _)| id.as_str())
            .collect();
        for (index, from) in before_ids.iter().enumerate() {
            if let Some(to) = after_ids.get(index.min(after_ids.len().saturating_sub(1))) {
                animations.push(Animation {
                    target: (*from).to_string(),
                    motion: Motion::MoveTo,
                    at: Cue::Fraction { fraction: 0.42 },
                    duration_secs: 0.9,
                    easing: Easing::EaseInOut,
                    destination: Some((*to).to_string()),
                });
            }
        }
    }
    animations.push(Animation {
        target: "*".into(),
        motion: Motion::Breathe,
        at: Cue::Start,
        duration_secs: 4.0,
        easing: Easing::EaseInOut,
        destination: None,
    });
    animations
}

/// Emphasis words: labels of objects that the narration mentions, limited to six.
fn plan_emphasis(composition: &Composition, narration: &str) -> Vec<String> {
    let words = narration_words(narration);
    let mut used = Vec::new();
    let mut emphasis = Vec::new();
    let labels: Vec<String> = match composition {
        Composition::Title { .. } | Composition::Code { .. } | Composition::Character { .. } => {
            Vec::new()
        }
        Composition::FlowDiagram { objects, .. }
        | Composition::Comparison { objects, .. }
        | Composition::Timeline { objects }
        | Composition::Chart { objects, .. }
        | Composition::Architecture { objects, .. }
        | Composition::Annotation { objects, .. }
        | Composition::Infographic { objects, .. }
        | Composition::CauseEffect { objects } => {
            objects.iter().map(|object| object.label.clone()).collect()
        }
        Composition::Transformation { before, after, .. } => before
            .iter()
            .chain(after.iter())
            .map(|object| object.label.clone())
            .collect(),
    };
    let shared = shared_words(&labels);
    for label in &labels {
        if let Some(position) = mention(label, &words, &mut used, 0, &shared) {
            let word = words[position].clone();
            if !emphasis.contains(&word) {
                emphasis.push(word);
            }
        }
        if emphasis.len() == 6 {
            break;
        }
    }
    emphasis
}

/// Plans one scene. The note after the directive becomes the learning goal when present.
pub fn plan_scene(scene: &Scene, index: usize) -> Result<StoryboardScene> {
    let composition = parse_composition(scene)?;
    let (_, note) = split_brief(&scene.visual_brief);
    let note = note.trim();
    let learning_goal = if note.is_empty() || matches!(composition, Composition::Code { .. }) {
        format!("Entender: {}", scene.heading)
    } else {
        note.lines().next().unwrap_or(note).trim().to_string()
    };
    let animations = plan_animations(&composition, &scene.narration);
    let planned = StoryboardScene {
        id: scene.id,
        concept: scene.heading.clone(),
        learning_goal,
        narration: scene.narration.trim().to_string(),
        segments: Vec::new(),
        duration_secs: 0.0,
        start_secs: 0.0,
        composition: composition.clone(),
        animations,
        captions: CaptionPlan {
            emphasis: plan_emphasis(&composition, &scene.narration),
            hidden: false,
        },
        resources: Vec::new(),
        validation: ValidationCriteria {
            spoken_terms: Vec::new(),
            min_visual_changes: 2,
            max_still_secs: 5.0,
            readable_without_audio: true,
        },
        // The opening cuts in; later scenes rotate push, zoom and fade so no two
        // consecutive changes look the same.
        transition: if index == 0 {
            Transition::Cut
        } else {
            [Transition::Fade, Transition::Push, Transition::Zoom][index % 3]
        },
    };
    planned.validate()?;
    Ok(planned)
}

/// Plans a whole script. Timing is filled later by narration.
///
/// As in the still-image catalog, a malformed directive is a note, not a defect: the scene
/// falls back to the default title layout and the reason is returned for the report.
pub fn plan_script(
    script: &Script,
    channel: &str,
    format: VideoFormat,
) -> Result<(Storyboard, Vec<String>)> {
    let mut fallbacks = Vec::new();
    let mut scenes = Vec::with_capacity(script.scenes.len());
    let described = described_cast(script);
    // The first character the script describes hosts the scenes without a directive.
    let cast = described.first().map_or_else(
        || character_name(cast_for(script)).to_string(),
        |(_, spec)| spec.clone(),
    );
    let total = script.scenes.len();
    for (index, scene) in script.scenes.iter().enumerate() {
        // A scene without a directive, or a question, is told by the character that fits
        // the topic; every other directive keeps its own composition.
        let (directive, note) = split_brief(&scene.visual_brief);
        let spoken = match directive {
            None => Some((
                pose_for(&scene.heading, index, total),
                scene.heading.as_str(),
            )),
            Some(("pergunta", question)) if !question.is_empty() => Some((Pose::Think, question)),
            _ => None,
        };
        // A described character is described once; later scenes may use the bare name.
        let scene = &match directive {
            Some(("personagem", args)) => {
                let (who, rest) = args.split_once('|').unwrap_or((args, ""));
                match described
                    .iter()
                    .find(|(key, _)| *key == crate::persona::key(who))
                {
                    Some((_, spec)) if !who.contains('(') => Scene {
                        visual_brief: format!("#personagem {spec} |{rest}\n{note}"),
                        ..scene.clone()
                    },
                    _ => scene.clone(),
                }
            }
            _ => scene.clone(),
        };
        let scene = &match spoken {
            Some((pose, line)) => Scene {
                visual_brief: format!(
                    "#personagem {} | {} | {}\n{note}",
                    cast,
                    pose_name(pose),
                    line.replace('|', "/"),
                ),
                ..scene.clone()
            },
            None => scene.clone(),
        };
        match plan_scene(scene, index) {
            Ok(planned) => scenes.push(planned),
            Err(error) => {
                let (_, note) = split_brief(&scene.visual_brief);
                let plain = Scene {
                    visual_brief: note.to_string(),
                    ..scene.clone()
                };
                scenes.push(plan_scene(&plain, index)?);
                fallbacks.push(format!("{error}; layout padrao usado"));
            }
        }
    }
    let storyboard = Storyboard {
        version: SCHEMA_VERSION,
        title: script.title.clone(),
        channel: channel.to_string(),
        format,
        language: "pt-BR".into(),
        scenes,
        source_hash: None,
    };
    storyboard.validate()?;
    Ok((storyboard, fallbacks))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scene(brief: &str, narration: &str) -> Scene {
        Scene {
            id: 3,
            heading: "Cena".into(),
            narration: narration.into(),
            visual_brief: brief.into(),
            duration_hint_secs: 5.0,
        }
    }

    fn script(title: &str, scenes: Vec<Scene>) -> Script {
        Script {
            title: title.into(),
            hook: String::new(),
            series: String::new(),
            format: crate::domain::ScriptFormat::Short,
            scenes,
            sources: Vec::new(),
            claims: Vec::new(),
            cross_checked: false,
        }
    }

    #[test]
    fn character_directive_takes_a_cast_member_a_pose_and_an_optional_line() {
        let parsed = parse_composition(&scene(
            "#personagem Robô | apontar | Metade dos tokens",
            "n",
        ))
        .unwrap();
        assert_eq!(
            parsed,
            Composition::Character {
                character: Character::Robot,
                pose: Pose::Point,
                text: "Metade dos tokens".into(),
                persona: None,
            }
        );
        let default_line = parse_composition(&scene("#personagem dev | pensar", "n")).unwrap();
        assert!(matches!(default_line, Composition::Character { ref text, .. } if text == "Cena"));
        for (brief, error) in [
            ("#personagem robo", "PERSONAGEM | POSE"),
            (
                "#personagem pirata | apontar",
                "apresentador, dev, cientista, robo ou descreva",
            ),
            (
                "#personagem robo | dancar",
                "explicar, apontar, pensar ou comemorar",
            ),
        ] {
            let message = parse_composition(&scene(brief, "n"))
                .unwrap_err()
                .to_string();
            assert!(message.contains(error), "{brief}: {message}");
        }
    }

    #[test]
    fn the_cast_follows_the_topic() {
        for (title, cast) in [
            (
                "Skills vs. Agentes de IA: a diferença na prática",
                Character::Robot,
            ),
            ("Como o Git guarda o seu código", Character::Developer),
            ("O que a ciência diz sobre o sono", Character::Scientist),
            ("Cinco receitas rápidas para a semana", Character::Presenter),
        ] {
            assert_eq!(cast_for(&script(title, Vec::new())), cast, "{title}");
        }
    }

    #[test]
    fn a_character_described_once_is_reused_by_name_and_hosts_the_plain_scenes() {
        let mut opening = scene(
            "#personagem Sócrates (careca, barba longa branca, toga branca) | explicar | Só sei que nada sei",
            "Só sei que nada sei.",
        );
        opening.id = 1;
        let mut again = scene("#personagem socrates | pensar | E você?", "E você?");
        again.id = 2;
        let mut plato = scene(
            "#personagem Platão (barba curta grisalha, toga azul, livro) | apontar",
            "Platão.",
        );
        plato.id = 3;
        let mut plain = scene("", "Uma cena sem diretiva.");
        plain.id = 4;
        let (storyboard, fallbacks) = plan_script(
            &script("Filosofia grega", vec![opening, again, plato, plain]),
            "Canal",
            VideoFormat::Horizontal,
        )
        .unwrap();
        assert!(fallbacks.is_empty(), "{fallbacks:?}");
        let names: Vec<Option<(String, Pose)>> = storyboard
            .scenes
            .iter()
            .map(|scene| match &scene.composition {
                Composition::Character {
                    persona: Some(persona),
                    pose,
                    ..
                } => Some((persona.name.clone(), *pose)),
                _ => None,
            })
            .collect();
        assert_eq!(
            names,
            vec![
                Some(("Sócrates".into(), Pose::Explain)),
                Some(("Sócrates".into(), Pose::Think)),
                Some(("Platão".into(), Pose::Point)),
                Some(("Sócrates".into(), Pose::Celebrate)),
            ],
            "the bare name reuses the description; the first described character hosts plain scenes"
        );
    }

    #[test]
    fn an_undescribed_name_or_an_unknown_trait_falls_back_and_says_why() {
        let mut unknown = scene("#personagem Aristóteles | explicar", "n");
        unknown.id = 1;
        let mut bad = scene("#personagem Kant (peruca, terno) | explicar", "n");
        bad.id = 2;
        let (storyboard, fallbacks) = plan_script(
            &script("Filosofia", vec![unknown, bad]),
            "Canal",
            VideoFormat::Vertical,
        )
        .unwrap();
        assert_eq!(storyboard.scenes.len(), 2);
        assert!(fallbacks[0].contains("descreva"), "{fallbacks:?}");
        assert!(fallbacks[1].contains("'peruca'"), "{fallbacks:?}");
    }

    #[test]
    fn scenes_without_a_directive_are_told_by_the_cast_and_explicit_ones_are_kept() {
        let mut question = scene("", "Por que isso importa?");
        question.heading = "Por que isso importa?".into();
        question.id = 1;
        let mut middle = scene(
            "#pergunta Vale a pena?\nNota livre do briefing",
            "Vale a pena? Explicando o meio.",
        );
        middle.id = 2;
        let mut kept = scene("#destaque", "Uma frase de destaque.");
        kept.id = 3;
        let mut closing = scene("", "Fechando o video.");
        closing.id = 4;
        let (storyboard, fallbacks) = plan_script(
            &script(
                "Agentes de IA no dia a dia",
                vec![question, middle, kept, closing],
            ),
            "Canal",
            VideoFormat::Vertical,
        )
        .unwrap();
        assert!(fallbacks.is_empty(), "{fallbacks:?}");
        let poses: Vec<Option<(Character, Pose)>> = storyboard
            .scenes
            .iter()
            .map(|scene| match &scene.composition {
                Composition::Character {
                    character, pose, ..
                } => Some((*character, *pose)),
                _ => None,
            })
            .collect();
        assert_eq!(
            poses,
            vec![
                Some((Character::Robot, Pose::Think)),
                Some((Character::Robot, Pose::Think)),
                None,
                Some((Character::Robot, Pose::Celebrate)),
            ]
        );
        assert_eq!(storyboard.scenes[1].learning_goal, "Nota livre do briefing");
        assert!(matches!(
            &storyboard.scenes[1].composition,
            Composition::Character { text, .. } if text == "Vale a pena?"
        ));
    }

    #[test]
    fn flow_directive_builds_a_loop_with_mention_cues() {
        let planned = plan_scene(
            &scene(
                "#fluxo Objetivo [user] -> Decidir {primary} -> Agir [tool] -> Observar -> loop",
                "O agente recebe o objetivo, decide o proximo passo, age com uma ferramenta e observa o resultado. Depois repete.",
            ),
            1,
        )
        .unwrap();
        let Composition::FlowDiagram {
            objects,
            relations,
            looped,
        } = &planned.composition
        else {
            panic!("expected flow");
        };
        assert!(looped);
        assert_eq!(objects.len(), 4);
        assert_eq!(relations.len(), 3);
        assert_eq!(objects[0].icon, Some(Icon::User));
        assert_eq!(objects[1].role, Role::Primary);
        assert!(planned.animations.iter().any(|animation| matches!(
            &animation.at,
            Cue::Word { word, .. } if word == "decide"
        )));
        assert!(planned.captions.emphasis.contains(&"decide".to_string()));
        assert_eq!(planned.transition, Transition::Push);
    }

    #[test]
    fn transitions_rotate_after_the_opening_cut() {
        let transitions: Vec<Transition> = (0..5)
            .map(|index| {
                plan_scene(&scene("#destaque", "Uma frase."), index)
                    .unwrap()
                    .transition
            })
            .collect();
        assert_eq!(
            transitions,
            vec![
                Transition::Cut,
                Transition::Push,
                Transition::Zoom,
                Transition::Fade,
                Transition::Push
            ]
        );
    }

    #[test]
    fn comparison_chart_code_and_annotation_directives_parse() {
        let comparison = parse_composition(&scene(
            "#comparacao Agente: decide; executa | Skill: ensina; repete",
            "n",
        ))
        .unwrap();
        assert!(
            matches!(comparison, Composition::Comparison { ref objects, .. } if objects.len() == 4)
        );
        let chart = parse_composition(&scene(
            "#grafico Tokens | Sem skill=100%; Com skill=40%",
            "cai de 100% para 40%",
        ))
        .unwrap();
        let Composition::Chart { objects, .. } = chart else {
            panic!()
        };
        assert_eq!(objects[1].value, Some(40.0));
        assert_eq!(objects[1].unit.as_deref(), Some("%"));
        let code = parse_composition(&scene(
            "#codigo markdown | SKILL.md\n---\nname: revisar-pr\n---",
            "n",
        ))
        .unwrap();
        assert!(matches!(code, Composition::Code { ref lines, .. } if lines.len() == 3));
        let annotation = parse_composition(&scene(
            "#anotacao skill/SKILL.md: instrucoes; skill/scripts/check.py: codigo opcional",
            "n",
        ))
        .unwrap();
        let Composition::Annotation { objects, notes } = annotation else {
            panic!()
        };
        assert_eq!(objects.len(), 4, "{objects:?}");
        assert_eq!(notes.len(), 2);
        assert_eq!(objects[0].icon, Some(Icon::Folder));
        assert_eq!(objects[1].icon, Some(Icon::File));
        assert_eq!(objects[1].parent.as_deref(), Some(objects[0].id.as_str()));
    }

    #[test]
    fn legacy_directives_still_plan_and_unknown_ones_fail() {
        for brief in [
            "#pergunta Qual a diferenca?",
            "#numero 175 bilhoes | parametros",
            "#lista Mostrar; Medir; Ajustar",
            "#linha-do-tempo 2012: AlexNet; 2017: Transformer",
            "#citacao Attention Is All You Need | Vaswani",
            "sem diretiva",
        ] {
            plan_scene(
                &scene(brief, "Eram 175 bilhoes. Attention Is All You Need."),
                0,
            )
            .unwrap_or_else(|error| panic!("{brief}: {error}"));
        }
        assert!(parse_composition(&scene("#grafico3d x", "n")).is_err());
        assert!(parse_composition(&scene("#fluxo so-um", "n")).is_err());
    }

    #[test]
    fn a_malformed_directive_falls_back_to_the_title_layout_and_is_reported() {
        let mut bad = scene(
            "#grafico Teste | qualidade=atendeu ao padrão?\nComparar os dois resultados",
            "Compare a qualidade do resultado.",
        );
        bad.id = 8;
        let good = Scene {
            id: 9,
            ..scene("#lista Mostrar; Medir", "Mostrar e medir.")
        };
        let script = Script {
            title: "Roteiro".into(),
            hook: "Gancho".into(),
            series: String::new(),
            format: crate::domain::ScriptFormat::Short,
            scenes: vec![bad, good],
            sources: Vec::new(),
            claims: Vec::new(),
            cross_checked: false,
        };
        let (storyboard, fallbacks) = plan_script(&script, "Canal", VideoFormat::Vertical).unwrap();
        assert!(matches!(
            storyboard.scenes[0].composition,
            Composition::Title { .. }
        ));
        assert_eq!(
            storyboard.scenes[0].learning_goal,
            "Comparar os dois resultados"
        );
        assert!(!matches!(
            storyboard.scenes[1].composition,
            Composition::Title { .. }
        ));
        assert_eq!(fallbacks.len(), 1);
        assert!(fallbacks[0].contains("cena 8") && fallbacks[0].contains("nao e numerico"));
    }

    #[test]
    fn sequential_steps_keep_their_order_and_ignore_shared_words() {
        let planned = plan_scene(
            &scene(
                "#causa Tarefa chega => Agente le descricoes => Tarefa combina => Carrega a skill inteira => Segue as instrucoes",
                "No inicio, o agente le so o nome e a descricao de cada skill. Quando a tarefa combina, ele carrega a skill inteira e segue as instrucoes.",
            ),
            1,
        )
        .unwrap();
        let words = narration_words(&planned.narration);
        let positions: Vec<usize> = planned
            .animations
            .iter()
            .filter(|animation| animation.motion == Motion::Reveal)
            .map(|animation| match &animation.at {
                Cue::Start => 0,
                Cue::Word { word, occurrence } => words
                    .iter()
                    .enumerate()
                    .filter(|(_, candidate)| *candidate == word)
                    .nth(*occurrence)
                    .map(|(position, _)| position)
                    .unwrap(),
                other => panic!("unexpected cue {other:?}"),
            })
            .collect();
        assert!(
            positions.windows(2).all(|pair| pair[0] < pair[1]),
            "{positions:?}"
        );
        // "skill" is shared by two labels and must not pull "Carrega a skill" before "combina".
        assert!(planned
            .animations
            .iter()
            .any(|animation| matches!(&animation.at, Cue::Word { word, .. } if word == "carrega")));
    }

    #[test]
    fn transformation_moves_before_objects_to_after_objects() {
        let planned = plan_scene(
            &scene(
                "#transformacao Prompt longo; Regras soltas => Skill versionada",
                "Virou uma skill versionada.",
            ),
            2,
        )
        .unwrap();
        let moves: Vec<_> = planned
            .animations
            .iter()
            .filter(|animation| animation.motion == Motion::MoveTo)
            .collect();
        assert_eq!(moves.len(), 2);
        assert!(moves
            .iter()
            .all(|animation| animation.destination.as_deref() == Some("depois-skill-versionada")));
    }
}
