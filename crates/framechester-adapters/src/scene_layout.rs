//! Closed catalog of scene layouts. The script declares data; the renderer owns the look.
//!
//! The first line of `visual_brief` may carry one directive, e.g. `#lista A; B; C`.
//! Everything after that line stays a free note for the operator. A brief without a
//! directive uses `Destaque`, the original heading + narration excerpt composition.
//! `docs/GUIA_VISUAL.md` documents the grammar; `tests/fixtures/scene-layouts.json` is
//! shared with the Studio validator so both sides accept exactly the same inputs.
use framechester_core::error::{FramechesterError, Result};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub label: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SceneLayout {
    Destaque,
    Pergunta(String),
    Numero { value: String, caption: String },
    Lista(Vec<String>),
    Comparacao { left: Entry, right: Entry },
    LinhaDoTempo(Vec<Entry>),
    Citacao { quote: String, author: String },
}

/// Directives of the motion engine (`framechester_core::planner`). The still-image
/// renderer does not animate them, so they render as `Destaque` without a warning; the
/// Studio mirror accepts them the same way.
pub const MOTION_DIRECTIVES: [&str; 9] = [
    "fluxo",
    "grafico",
    "arquitetura",
    "codigo",
    "transformacao",
    "anotacao",
    "infografico",
    "causa",
    "personagem",
];

const MAX_SLOT: usize = 160;
const MAX_VALUE: usize = 16;

fn invalid(scene_id: u32, detail: &str) -> FramechesterError {
    FramechesterError::InvalidInput(format!(
        "cena {scene_id}: diretiva visual invalida; {detail}"
    ))
}

fn slot(scene_id: u32, value: &str, max: usize) -> Result<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > max {
        return Err(invalid(
            scene_id,
            &format!("cada campo precisa de 1 a {max} caracteres"),
        ));
    }
    Ok(value.to_owned())
}

fn split(scene_id: u32, args: &str, separator: char, min: usize, max: usize) -> Result<Vec<&str>> {
    let parts: Vec<&str> = args.split(separator).collect();
    if !(min..=max).contains(&parts.len()) {
        return Err(invalid(
            scene_id,
            &if min == max {
                format!("use exatamente {min} campos separados por '{separator}'")
            } else {
                format!("informe de {min} a {max} itens separados por '{separator}'")
            },
        ));
    }
    Ok(parts)
}

fn pair(scene_id: u32, args: &str) -> Result<(String, String)> {
    let parts = split(scene_id, args, '|', 2, 2)?;
    Ok((
        slot(scene_id, parts[0], MAX_SLOT)?,
        slot(scene_id, parts[1], MAX_SLOT)?,
    ))
}

fn items(scene_id: u32, args: &str) -> Result<Vec<String>> {
    split(scene_id, args, ';', 2, 5)?
        .into_iter()
        .map(|item| slot(scene_id, item, MAX_SLOT))
        .collect()
}

fn entry(scene_id: u32, value: &str) -> Result<Entry> {
    let (label, text) = value
        .split_once(':')
        .ok_or_else(|| invalid(scene_id, "cada item precisa do formato 'rotulo: texto'"))?;
    Ok(Entry {
        label: slot(scene_id, label, 40)?,
        text: slot(scene_id, text, MAX_SLOT)?,
    })
}

fn normalized(text: &str) -> String {
    text.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// Numbers and quotes on screen must also be spoken, so they reach the claims review.
fn spoken(scene_id: u32, value: &str, narration: &str, what: &str) -> Result<()> {
    if normalized(narration).contains(&normalized(value)) {
        Ok(())
    } else {
        Err(invalid(
            scene_id,
            &format!("{what} '{value}' precisa aparecer na narracao da cena"),
        ))
    }
}

/// The layout a scene renders with: an invalid directive is treated as a free note and the
/// scene uses `Destaque`. The reason is returned so the report can say so; it never fails.
pub fn parse_or_default(
    scene_id: u32,
    visual_brief: &str,
    narration: &str,
) -> (SceneLayout, Option<String>) {
    match parse(scene_id, visual_brief, narration) {
        Ok(layout) => (layout, None),
        Err(error) => (SceneLayout::Destaque, Some(error.to_string())),
    }
}

pub fn parse(scene_id: u32, visual_brief: &str, narration: &str) -> Result<SceneLayout> {
    let first = visual_brief.lines().next().unwrap_or("").trim();
    // `# Titulo` (Markdown) is a free note; a directive starts with a letter.
    let Some(directive) = first
        .strip_prefix('#')
        .filter(|rest| rest.starts_with(char::is_alphabetic))
    else {
        return Ok(SceneLayout::Destaque);
    };
    let (name, args) = directive
        .split_once(char::is_whitespace)
        .unwrap_or((directive, ""));
    let args = args.trim();
    match name {
        "destaque" if args.is_empty() => Ok(SceneLayout::Destaque),
        "destaque" => Err(invalid(scene_id, "#destaque nao recebe campos")),
        "pergunta" => Ok(SceneLayout::Pergunta(slot(scene_id, args, MAX_SLOT)?)),
        "numero" => {
            let (value, caption) = pair(scene_id, args)?;
            if value.chars().count() > MAX_VALUE || !value.chars().any(|c| c.is_ascii_digit()) {
                return Err(invalid(
                    scene_id,
                    &format!("o valor precisa conter um digito e ate {MAX_VALUE} caracteres"),
                ));
            }
            spoken(scene_id, &value, narration, "o valor")?;
            Ok(SceneLayout::Numero { value, caption })
        }
        "lista" => Ok(SceneLayout::Lista(items(scene_id, args)?)),
        "comparacao" => {
            let sides = split(scene_id, args, '|', 2, 2)?;
            Ok(SceneLayout::Comparacao {
                left: entry(scene_id, sides[0])?,
                right: entry(scene_id, sides[1])?,
            })
        }
        "linha-do-tempo" => Ok(SceneLayout::LinhaDoTempo(
            split(scene_id, args, ';', 2, 5)?
                .into_iter()
                .map(|item| entry(scene_id, item))
                .collect::<Result<_>>()?,
        )),
        "citacao" => {
            let (quote, author) = pair(scene_id, args)?;
            spoken(scene_id, &quote, narration, "a citacao")?;
            Ok(SceneLayout::Citacao { quote, author })
        }
        name if MOTION_DIRECTIVES.contains(&name) => Ok(SceneLayout::Destaque),
        other => Err(invalid(
            scene_id,
            &format!(
                "'#{other}' nao existe; use destaque, pergunta, numero, lista, comparacao, linha-do-tempo, citacao ou uma diretiva do motor motion (fluxo, grafico, arquitetura, codigo, transformacao, anotacao, infografico, causa, personagem)"
            ),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    struct Case {
        brief: String,
        narration: String,
        layout: Option<String>,
    }

    fn name(layout: &SceneLayout) -> &'static str {
        match layout {
            SceneLayout::Destaque => "destaque",
            SceneLayout::Pergunta(_) => "pergunta",
            SceneLayout::Numero { .. } => "numero",
            SceneLayout::Lista(_) => "lista",
            SceneLayout::Comparacao { .. } => "comparacao",
            SceneLayout::LinhaDoTempo(_) => "linha-do-tempo",
            SceneLayout::Citacao { .. } => "citacao",
        }
    }

    #[test]
    fn shared_fixture_matches_studio_validator() {
        let raw = include_str!("../../../tests/fixtures/scene-layouts.json");
        let cases: Vec<Case> = serde_json::from_str(raw).unwrap();
        assert!(cases.len() >= 10);
        for case in cases {
            let parsed = parse(7, &case.brief, &case.narration);
            match (&case.layout, parsed) {
                (Some(expected), Ok(layout)) => {
                    assert_eq!(expected, name(&layout), "{}", case.brief)
                }
                (None, Err(_)) => {}
                (expected, got) => panic!("{}: expected {expected:?}, got {got:?}", case.brief),
            }
        }
    }

    #[test]
    fn slots_are_typed() {
        let layout = parse(
            1,
            "#comparacao CPU: sequencial | GPU: paralela\nnota livre",
            "",
        )
        .unwrap();
        assert_eq!(
            layout,
            SceneLayout::Comparacao {
                left: Entry {
                    label: "CPU".into(),
                    text: "sequencial".into()
                },
                right: Entry {
                    label: "GPU".into(),
                    text: "paralela".into()
                },
            }
        );
    }
}
