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

fn pair(scene_id: u32, args: &str, separator: char) -> Result<(String, String)> {
    let mut parts = args.split(separator);
    let (Some(first), Some(second), None) = (parts.next(), parts.next(), parts.next()) else {
        return Err(invalid(
            scene_id,
            &format!("use exatamente dois campos separados por '{separator}'"),
        ));
    };
    Ok((
        slot(scene_id, first, MAX_SLOT)?,
        slot(scene_id, second, MAX_SLOT)?,
    ))
}

fn items(scene_id: u32, args: &str) -> Result<Vec<String>> {
    let rows = args
        .split(';')
        .map(|item| slot(scene_id, item, MAX_SLOT))
        .collect::<Result<Vec<_>>>()?;
    if !(2..=5).contains(&rows.len()) {
        return Err(invalid(
            scene_id,
            "informe de 2 a 5 itens separados por ';'",
        ));
    }
    Ok(rows)
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
            let (value, caption) = pair(scene_id, args, '|')?;
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
            let (left, right) = pair(scene_id, args, '|')?;
            Ok(SceneLayout::Comparacao {
                left: entry(scene_id, &left)?,
                right: entry(scene_id, &right)?,
            })
        }
        "linha-do-tempo" => Ok(SceneLayout::LinhaDoTempo(
            items(scene_id, args)?
                .iter()
                .map(|item| entry(scene_id, item))
                .collect::<Result<_>>()?,
        )),
        "citacao" => {
            let (quote, author) = pair(scene_id, args, '|')?;
            spoken(scene_id, &quote, narration, "a citacao")?;
            Ok(SceneLayout::Citacao { quote, author })
        }
        other => Err(invalid(
            scene_id,
            &format!(
                "'#{other}' nao existe; use destaque, pergunta, numero, lista, comparacao, linha-do-tempo ou citacao"
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
