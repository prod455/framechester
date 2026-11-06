//! The `#palco` script directive: a stage scene written in plain lines under the
//! directive. The script describes the cast and the gauge once; later scenes name the
//! actor and give only where the gauge goes, and [`StageMemory`] fills in the rest, so a
//! model writing the script only has to keep the story straight.
//!
//! ```text
//! #palco Pare de queimar o seu *limite*
//! ator: Opus (capacete)
//! objeto: moeda Opus | rival Haiku
//! medidor: limite | 100 -> 40 % | selo
//! tarefas: listar pasta; ler log -> objeto; raciocínio pesado -> Opus
//! selo: mais barato
//! Nota livre: vira o objetivo de aprendizagem.
//! ```
use crate::error::{FramechesterError, Result};
use crate::storyboard::{
    narration_words, Actor, Composition, Hat, Meter, MeterStyle, Prop, Role, TableRow, Task,
};
use std::collections::HashMap;

/// Keys a `#palco` line may start with.
pub const KEYS: [&str; 5] = ["ator", "objeto", "medidor", "tarefas", "selo"];

/// Roles the cast takes in order of first appearance, unless the script gives one.
const CAST_ROLES: [Role; 5] = [
    Role::Primary,
    Role::Secondary,
    Role::Accent,
    Role::Success,
    Role::Warning,
];

fn invalid(scene_id: u32, detail: impl std::fmt::Display) -> FramechesterError {
    FramechesterError::InvalidInput(format!(
        "cena {scene_id}: diretiva visual invalida; #palco: {detail}"
    ))
}

fn fold(text: &str) -> String {
    crate::persona::key(text)
}

/// The key of a `chave: valor` line, when it is one of [`KEYS`].
fn keyed(line: &str) -> Option<(&'static str, &str)> {
    let (key, value) = line.split_once(':')?;
    let key = fold(key.trim());
    KEYS.iter()
        .find(|known| **known == key)
        .map(|known| (*known, value.trim()))
}

/// The first line under the directive that is not a stage line: the scene's free note.
pub fn note(rest: &str) -> Option<&str> {
    rest.lines()
        .map(str::trim)
        .find(|line| !line.is_empty() && keyed(line).is_none())
}

fn hat(scene_id: u32, word: &str) -> Result<Hat> {
    Ok(match fold(word.trim()).as_str() {
        "capacete" => Hat::HardHat,
        "bone" => Hat::Cap,
        "oculos" => Hat::Glasses,
        "coroa" => Hat::Crown,
        "nenhum" | "sem" | "" => Hat::None,
        other => {
            return Err(invalid(
                scene_id,
                format!(
                    "acessorio '{other}' nao existe; use capacete, bone, oculos, coroa ou nenhum"
                ),
            ))
        }
    })
}

/// Actor id from its name: lower-case words joined by hyphens.
fn actor_id(name: &str) -> String {
    let id = fold(name)
        .split(|c: char| !c.is_alphanumeric())
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if id.is_empty() {
        "ator".into()
    } else {
        id
    }
}

/// A number written in Portuguese or English style ("40", "40,5", "40.5").
fn number(text: &str) -> Option<f64> {
    let text = text.trim().replace(',', ".");
    if text.is_empty() {
        return None;
    }
    text.parse::<f64>().ok()
}

/// Splits "40 %" or "40%" into the number and its unit.
fn value_and_unit(text: &str) -> Option<(f64, Option<String>)> {
    let text = text.trim();
    let end = text
        .char_indices()
        .find(|(_, c)| !(c.is_ascii_digit() || *c == ',' || *c == '.' || *c == '-'))
        .map_or(text.len(), |(at, _)| at);
    let value = number(&text[..end])?;
    let unit = text[end..].trim();
    Some((value, (!unit.is_empty()).then(|| unit.to_string())))
}

/// What the script has said so far about the stage: who the cast is and where each gauge
/// stopped.
#[derive(Debug, Clone, Default)]
pub struct StageMemory {
    /// (key, name, hat, role) in order of first appearance.
    cast: Vec<(String, String, Hat, Role)>,
    meters: HashMap<String, f64>,
}

impl StageMemory {
    /// A memory that already knows the channel's recurring cast, so a script can name them
    /// without describing them; a script that describes them again wins for that video.
    pub fn with_cast(cast: &[crate::storyboard::CastMember]) -> Self {
        let mut memory = Self::default();
        for member in cast {
            let role = CAST_ROLES[memory.cast.len() % CAST_ROLES.len()];
            memory.cast.push((
                fold(&member.name),
                member.name.trim().to_string(),
                member.hat,
                role,
            ));
        }
        memory
    }

    /// Parses one `#palco` scene; on success, records its cast and where its gauge ends.
    pub fn parse(
        &mut self,
        scene_id: u32,
        headline: &str,
        rest: &str,
        narration: &str,
    ) -> Result<Composition> {
        let mut next = self.clone();
        let composition = next.parse_inner(scene_id, headline, rest, narration)?;
        *self = next;
        Ok(composition)
    }

    fn parse_inner(
        &mut self,
        scene_id: u32,
        headline: &str,
        rest: &str,
        narration: &str,
    ) -> Result<Composition> {
        let headline = headline.trim();
        if headline.is_empty() {
            return Err(invalid(
                scene_id,
                "escreva o titulo do bloco depois de #palco",
            ));
        }
        let mut actors: Vec<Actor> = Vec::new();
        let mut prop = None;
        let mut meter = None;
        let mut tasks = Vec::new();
        let mut stamp = None;
        let mut pending_tasks: Option<&str> = None;
        for line in rest.lines().map(str::trim) {
            let Some((key, value)) = keyed(line) else {
                continue;
            };
            if value.is_empty() {
                return Err(invalid(scene_id, format!("'{key}:' sem conteudo")));
            }
            match key {
                "ator" => actors.push(self.actor(scene_id, value)?),
                "objeto" => prop = Some(parse_prop(scene_id, value)?),
                "medidor" => meter = Some(self.meter(scene_id, value, narration)?),
                "tarefas" => pending_tasks = Some(value),
                "selo" => stamp = Some(value.to_string()),
                _ => unreachable!("keyed only returns KEYS"),
            }
        }
        // Tasks name actors, so they are read once the whole cast is known.
        if let Some(value) = pending_tasks {
            for raw in value
                .split(';')
                .map(str::trim)
                .filter(|raw| !raw.is_empty())
            {
                let (label, to) = match raw.rsplit_once("->") {
                    Some((label, target)) => {
                        let target = fold(target.trim());
                        let to = if ["objeto", "moeda", "funil", "muro", "tabela", "envelope"]
                            .contains(&target.as_str())
                        {
                            "prop".to_string()
                        } else {
                            let id = actor_id(&target);
                            if !actors.iter().any(|actor| actor.id == id) {
                                return Err(invalid(
                                    scene_id,
                                    format!(
                                        "tarefa '{}' vai para '{target}', que nao esta em cena",
                                        label.trim()
                                    ),
                                ));
                            }
                            id
                        };
                        (label.trim(), Some(to))
                    }
                    None => (raw, None),
                };
                tasks.push(Task {
                    label: label.to_string(),
                    to,
                    at: None,
                });
            }
        }
        // Without an actor, tasks go to the prop.
        if actors.is_empty() {
            for task in tasks.iter_mut() {
                task.to.get_or_insert_with(|| "prop".into());
            }
        }
        if let Some(meter) = &meter {
            self.meters.insert(fold(&meter.label), meter.to);
        }
        Ok(Composition::Stage {
            headline: headline.to_string(),
            actors,
            prop,
            meter,
            tasks,
            stamp,
        })
    }

    /// `Nome (acessório) {papel}`; a name already described may come alone.
    fn actor(&mut self, scene_id: u32, raw: &str) -> Result<Actor> {
        let mut text = raw.trim().to_string();
        let mut role = None;
        if let (Some(open), Some(close)) = (text.find('{'), text.find('}')) {
            if close > open {
                let token = text[open + 1..close].trim().to_lowercase();
                role = Some(
                    crate::planner::parse_role(&token)
                        .ok_or_else(|| invalid(scene_id, format!("papel '{token}' nao existe")))?,
                );
                text.replace_range(open..=close, "");
            }
        }
        let mut accessory = None;
        if let (Some(open), Some(close)) = (text.find('('), text.rfind(')')) {
            if close > open {
                accessory = Some(hat(scene_id, &text[open + 1..close])?);
                text.replace_range(open..=close, "");
            }
        }
        let name = text.trim().to_string();
        if name.is_empty() {
            return Err(invalid(scene_id, "ator sem nome"));
        }
        let key = fold(&name);
        let known = self.cast.iter().position(|(known, ..)| *known == key);
        let index = match known {
            Some(index) => {
                let entry = &mut self.cast[index];
                if let Some(hat) = accessory {
                    entry.2 = hat;
                }
                if let Some(role) = role {
                    entry.3 = role;
                }
                index
            }
            None => {
                let role = role.unwrap_or(CAST_ROLES[self.cast.len() % CAST_ROLES.len()]);
                self.cast
                    .push((key, name.clone(), accessory.unwrap_or_default(), role));
                self.cast.len() - 1
            }
        };
        let (_, name, hat, role) = &self.cast[index];
        Ok(Actor {
            id: actor_id(name),
            name: name.clone(),
            hat: *hat,
            role: *role,
        })
    }

    /// `Rótulo | 90 -> 20 % | selo`; without the start, the gauge starts where the same
    /// gauge stopped (or at 100). The value is printed only when the narration says it.
    fn meter(&self, scene_id: u32, raw: &str, narration: &str) -> Result<Meter> {
        let mut parts = raw.split('|').map(str::trim);
        let label = parts.next().unwrap_or_default().to_string();
        let range = parts
            .next()
            .ok_or_else(|| invalid(scene_id, "medidor exige 'Rotulo | de -> para'"))?;
        let style = match parts.next().map(fold).as_deref() {
            None | Some("barra") => MeterStyle::Bar,
            Some("selo") => MeterStyle::Badge,
            Some(other) => {
                return Err(invalid(
                    scene_id,
                    format!("estilo de medidor '{other}' nao existe; use barra ou selo"),
                ))
            }
        };
        let (from, to) = match range.split_once("->") {
            Some((from, to)) => (from.trim(), to.trim()),
            None => ("", range),
        };
        let (to, unit) = value_and_unit(to).ok_or_else(|| {
            invalid(
                scene_id,
                format!("valor final '{to}' do medidor nao e numero"),
            )
        })?;
        let from = if from.is_empty() {
            self.meters.get(&fold(&label)).copied().unwrap_or(100.0)
        } else {
            value_and_unit(from)
                .map(|(value, _)| value)
                .ok_or_else(|| {
                    invalid(
                        scene_id,
                        format!("valor inicial '{from}' do medidor nao e numero"),
                    )
                })?
        };
        let spoken = format!("{}", to.round() as i64);
        let numeric = narration_words(narration).contains(&spoken);
        Ok(Meter {
            label,
            from,
            to,
            unit,
            numeric,
            style,
        })
    }
}

fn parse_prop(scene_id: u32, raw: &str) -> Result<Prop> {
    let (kind, args) = raw
        .trim()
        .split_once(char::is_whitespace)
        .unwrap_or((raw.trim(), ""));
    let mut parts = args.split('|').map(str::trim);
    let first = parts.next().unwrap_or_default().to_string();
    let second = parts.next().map(str::to_string);
    let need = |value: &str, what: &str| {
        if value.is_empty() {
            Err(invalid(scene_id, format!("objeto {kind} exige {what}")))
        } else {
            Ok(())
        }
    };
    Ok(match fold(kind).as_str() {
        "moeda" => {
            need(&first, "um rotulo")?;
            let rival = second
                .map(|value| {
                    value
                        .strip_prefix("rival")
                        .unwrap_or(&value)
                        .trim()
                        .to_string()
                })
                .filter(|value| !value.is_empty());
            Prop::Coin {
                label: first,
                rival,
            }
        }
        "funil" => {
            need(&first, "um rotulo")?;
            Prop::Funnel {
                label: first,
                note: second.filter(|value| !value.is_empty()),
            }
        }
        "muro" => Prop::Wall,
        "tabela" => {
            need(&first, "um titulo")?;
            let rows_text = second.unwrap_or_default();
            let mut mark = None;
            let mut rows = Vec::new();
            for (index, row) in rows_text
                .split(';')
                .map(str::trim)
                .filter(|row| !row.is_empty())
                .enumerate()
            {
                let marked = row.starts_with('*') && row.ends_with('*') && row.len() > 2;
                let row = row.trim_matches('*');
                let (label, value) = row.split_once('=').ok_or_else(|| {
                    invalid(
                        scene_id,
                        format!("linha '{row}' da tabela precisa de rotulo=valor"),
                    )
                })?;
                if marked {
                    mark = Some(index);
                }
                rows.push(TableRow {
                    label: label.trim().to_string(),
                    value: value.trim().to_string(),
                });
            }
            Prop::Table {
                title: first,
                rows,
                mark,
            }
        }
        "envelope" => {
            need(&first, "o comentario pedido")?;
            Prop::Envelope { comment: first }
        }
        other => {
            return Err(invalid(
                scene_id,
                format!("objeto '{other}' nao existe; use moeda, funil, muro, tabela ou envelope"),
            ))
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_cast_and_the_gauge_are_described_once_and_carried() {
        let mut memory = StageMemory::default();
        let first = memory
            .parse(
                1,
                "Até o *fácil*",
                "ator: Opus (capacete)\nmedidor: Uso do plano restante | 90 -> 20 %\ntarefas: renomear arquivo; ler log\nO Opus gasta o plano.",
                "O Opus faz tudo e o plano cai para 20%.",
            )
            .unwrap();
        let Composition::Stage {
            actors,
            meter,
            tasks,
            ..
        } = first
        else {
            panic!()
        };
        assert_eq!(actors[0].id, "opus");
        assert_eq!(actors[0].hat, Hat::HardHat);
        assert_eq!(actors[0].role, Role::Primary);
        let meter = meter.unwrap();
        assert_eq!((meter.from, meter.to, meter.numeric), (90.0, 20.0, true));
        assert_eq!(meter.unit.as_deref(), Some("%"));
        assert_eq!(tasks.len(), 2);
        let second = memory
            .parse(
                2,
                "O Haiku pega o *braçal*",
                "ator: Haiku (boné)\nator: Opus\nobjeto: funil Skill | separa as tarefas\nmedidor: Uso do plano restante | -> 15 %\ntarefas: ler log -> Haiku; raciocínio pesado -> Opus",
                "A skill separa. O plano quase acaba.",
            )
            .unwrap();
        let Composition::Stage {
            actors,
            meter,
            tasks,
            prop,
            ..
        } = second
        else {
            panic!()
        };
        assert_eq!(actors[1].hat, Hat::HardHat, "Opus keeps its hard hat");
        assert_eq!(actors[0].role, Role::Secondary);
        let meter = meter.unwrap();
        assert_eq!(meter.from, 20.0, "the gauge starts where it stopped");
        assert!(!meter.numeric, "15 is not spoken, so it is not printed");
        assert_eq!(tasks[1].to.as_deref(), Some("opus"));
        assert!(matches!(prop, Some(Prop::Funnel { note: Some(_), .. })));
    }

    #[test]
    fn the_channel_cast_is_known_before_the_script_names_it() {
        let mut memory = StageMemory::with_cast(&[crate::storyboard::CastMember {
            name: "Bit".into(),
            hat: Hat::Glasses,
        }]);
        let Composition::Stage { actors, .. } = memory.parse(1, "X", "ator: Bit", "x").unwrap()
        else {
            panic!()
        };
        assert_eq!(
            (actors[0].id.as_str(), actors[0].hat, actors[0].role),
            ("bit", Hat::Glasses, Role::Primary)
        );
    }

    #[test]
    fn a_bad_line_fails_and_leaves_the_memory_untouched() {
        let mut memory = StageMemory::default();
        assert!(memory
            .parse(1, "X", "ator: Opus (chapeu)", "x")
            .unwrap_err()
            .to_string()
            .contains("chapeu"));
        assert!(memory
            .parse(1, "X", "ator: Opus\ntarefas: ler -> Haiku", "x")
            .unwrap_err()
            .to_string()
            .contains("Haiku".to_lowercase().as_str()));
        assert!(memory.cast.is_empty());
        let table = memory
            .parse(
                2,
                "X",
                "objeto: tabela Custo | Opus=100; *Haiku=10*\ntarefas: ler",
                "custa 100 e 10",
            )
            .unwrap();
        let Composition::Stage {
            prop: Some(Prop::Table { rows, mark, .. }),
            tasks,
            ..
        } = table
        else {
            panic!()
        };
        assert_eq!((rows.len(), mark), (2, Some(1)));
        assert_eq!(tasks[0].to.as_deref(), Some("prop"));
        assert_eq!(note("ator: X\nNota livre"), Some("Nota livre"));
    }
}
