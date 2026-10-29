//! Narration segmentation and timing. A scene is narrated as one segment per sentence or
//! beat, each synthesized separately, so segment boundaries are real audio boundaries.
//! Word boundaries inside a segment are estimated by interpolation unless an aligner
//! supplies them; the storyboard records which one it was.
use crate::storyboard::{NarrationSegment, TimedWord};

/// Pause inserted between segments of the same scene, in seconds.
pub const PAUSE_BETWEEN_SEGMENTS_SECS: f32 = 0.28;
/// Pause after the last segment of a scene before the next scene starts.
pub const PAUSE_AFTER_SCENE_SECS: f32 = 0.45;
/// Extra pause after a sentence that ends a paragraph (double newline in the narration).
pub const PAUSE_PARAGRAPH_SECS: f32 = 0.25;

/// Splits a narration into segments at sentence ends and paragraph breaks. Abbreviations
/// like "etc." or decimal numbers do not split. Returns the trimmed segments.
pub fn segment_narration(text: &str) -> Vec<String> {
    let mut segments = Vec::new();
    for paragraph in text.split("\n\n") {
        let normalized = paragraph.split_whitespace().collect::<Vec<_>>().join(" ");
        if normalized.is_empty() {
            continue;
        }
        let characters: Vec<char> = normalized.chars().collect();
        let mut current = String::new();
        let mut index = 0;
        while index < characters.len() {
            let character = characters[index];
            current.push(character);
            let ends_sentence = matches!(character, '.' | '!' | '?' | ';' | '…');
            if ends_sentence {
                // Closing quotes or parentheses stay with the sentence.
                while index + 1 < characters.len()
                    && matches!(characters[index + 1], '"' | '”' | ')' | '\'' | '’')
                {
                    index += 1;
                    current.push(characters[index]);
                }
                let next_is_boundary = index + 1 >= characters.len()
                    || characters[index + 1].is_whitespace()
                        && characters
                            .get(index + 2)
                            .is_none_or(|next| !next.is_ascii_digit() || character != '.');
                let decimal = character == '.'
                    && characters
                        .get(index + 1)
                        .is_some_and(|next| next.is_ascii_digit());
                if next_is_boundary && !decimal && !is_abbreviation(&current) {
                    let trimmed = current.trim();
                    if !trimmed.is_empty() {
                        segments.push(trimmed.to_string());
                    }
                    current.clear();
                }
            }
            index += 1;
        }
        let trimmed = current.trim();
        if !trimmed.is_empty() {
            segments.push(trimmed.to_string());
        }
    }
    merge_tiny_segments(segments)
}

fn is_abbreviation(current: &str) -> bool {
    let last_word = current
        .trim_end_matches(['.', '"', '”', ')', '\'', '’'])
        .rsplit(char::is_whitespace)
        .next()
        .unwrap_or("")
        .to_lowercase();
    matches!(
        last_word.as_str(),
        "etc" | "ex" | "dr" | "sr" | "sra" | "prof" | "p" | "vs" | "ltda" | "n" | "nº"
    ) || (last_word.chars().count() == 1 && last_word.chars().all(char::is_alphabetic))
}

/// A segment of one or two words (e.g. "Pronto.") is merged into its neighbour so the
/// narrator does not pause awkwardly and captions do not flash.
fn merge_tiny_segments(segments: Vec<String>) -> Vec<String> {
    let mut merged: Vec<String> = Vec::new();
    for segment in segments {
        let words = segment.split_whitespace().count();
        if words <= 2 {
            if let Some(previous) = merged.last_mut() {
                previous.push(' ');
                previous.push_str(&segment);
                continue;
            }
        }
        merged.push(segment);
    }
    merged
}

/// Measured audio of one synthesized segment.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SegmentAudio {
    pub duration_secs: f32,
    /// Silence before the first voiced sample.
    pub leading_silence_secs: f32,
    /// Silence after the last voiced sample.
    pub trailing_silence_secs: f32,
}

/// Relative weight of a word in time: letters count, digits count double (they are read
/// as full numbers) and punctuation adds a pause.
fn word_weight(word: &str) -> f32 {
    let mut weight = 0.0f32;
    for character in word.chars() {
        if character.is_ascii_digit() {
            weight += 2.2;
        } else if character.is_alphabetic() {
            weight += 1.0;
        } else if matches!(character, ',' | ';' | ':') {
            weight += 1.8;
        } else if matches!(character, '.' | '!' | '?' | '…') {
            weight += 2.5;
        } else if matches!(character, '-' | '—' | '–') {
            weight += 0.6;
        }
    }
    weight.max(0.8)
}

/// Estimates word intervals by weight inside the voiced part of a segment. `offset_secs`
/// is where the segment starts in the scene.
pub fn estimate_words(text: &str, audio: SegmentAudio, offset_secs: f32) -> Vec<TimedWord> {
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.is_empty() {
        return Vec::new();
    }
    let voiced_start = offset_secs + audio.leading_silence_secs.max(0.0);
    let voiced_end = (offset_secs + audio.duration_secs - audio.trailing_silence_secs.max(0.0))
        .max(voiced_start + 0.05);
    let span = voiced_end - voiced_start;
    let weights: Vec<f32> = words.iter().map(|word| word_weight(word)).collect();
    let total: f32 = weights.iter().sum::<f32>().max(0.1);
    let mut cursor = voiced_start;
    let mut timed = Vec::with_capacity(words.len());
    for (index, word) in words.iter().enumerate() {
        let end = if index + 1 == words.len() {
            voiced_end
        } else {
            cursor + span * weights[index] / total
        };
        timed.push(TimedWord {
            text: (*word).to_string(),
            start_secs: cursor,
            end_secs: end.max(cursor),
        });
        cursor = end.max(cursor);
    }
    timed
}

/// Builds the scene's segment list from measured audio, inserting semantic pauses.
/// Returns the segments and the scene duration (including the final pause).
pub fn assemble_scene(
    texts: &[String],
    audio: &[SegmentAudio],
    paragraph_breaks: &[bool],
) -> (Vec<NarrationSegment>, f32) {
    let mut segments = Vec::with_capacity(texts.len());
    let mut cursor = 0.0f32;
    for (index, (text, measured)) in texts.iter().zip(audio).enumerate() {
        let start = cursor;
        let end = start + measured.duration_secs.max(0.05);
        let words = estimate_words(text, *measured, start);
        segments.push(NarrationSegment {
            text: text.clone(),
            start_secs: start,
            end_secs: end,
            words,
            aligned: false,
        });
        cursor = end;
        if index + 1 < texts.len() {
            cursor += PAUSE_BETWEEN_SEGMENTS_SECS;
            if paragraph_breaks.get(index).copied().unwrap_or(false) {
                cursor += PAUSE_PARAGRAPH_SECS;
            }
        }
    }
    (segments, cursor + PAUSE_AFTER_SCENE_SECS)
}

/// Which segments end a paragraph (a double newline follows them in the narration).
pub fn paragraph_breaks(text: &str, segments: &[String]) -> Vec<bool> {
    let mut breaks = vec![false; segments.len()];
    let mut index = 0usize;
    for paragraph in text.split("\n\n") {
        let count = segment_narration(paragraph).len();
        if count == 0 {
            continue;
        }
        index += count;
        if index > 0 && index <= segments.len() {
            breaks[index - 1] = true;
        }
    }
    if let Some(last) = breaks.last_mut() {
        *last = false;
    }
    breaks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_sentences_but_not_decimals_or_abbreviations() {
        let text = "Custa 3.5 vezes mais do que antes. Veja o Dr. Silva, etc. Pronto! Ok?";
        let segments = segment_narration(text);
        // "Pronto!" and "Ok?" are tiny and merge into the previous sentence.
        assert_eq!(
            segments,
            vec![
                "Custa 3.5 vezes mais do que antes.".to_string(),
                "Veja o Dr. Silva, etc. Pronto! Ok?".to_string(),
            ]
        );
    }

    #[test]
    fn tiny_segments_merge_and_paragraphs_split() {
        let text = "Primeira frase longa aqui.\n\nSegunda frase longa aqui. Fim.";
        let segments = segment_narration(text);
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[1], "Segunda frase longa aqui. Fim.");
        let breaks = paragraph_breaks(text, &segments);
        assert_eq!(breaks, vec![true, false]);
    }

    #[test]
    fn word_timing_covers_the_voiced_span_in_order() {
        let audio = SegmentAudio {
            duration_secs: 3.0,
            leading_silence_secs: 0.2,
            trailing_silence_secs: 0.3,
        };
        let words = estimate_words("Um agente decide, age e observa.", audio, 10.0);
        assert_eq!(words.len(), 6);
        assert!((words[0].start_secs - 10.2).abs() < 1e-4);
        assert!((words.last().unwrap().end_secs - 12.7).abs() < 1e-4);
        for pair in words.windows(2) {
            assert!(pair[0].end_secs <= pair[1].start_secs + 1e-5);
        }
        assert!(words[2].end_secs - words[2].start_secs > words[4].end_secs - words[4].start_secs);
    }

    #[test]
    fn assembled_scene_adds_pauses_and_total_duration() {
        let texts = vec!["Uma.".to_string(), "Duas.".to_string()];
        let audio = vec![
            SegmentAudio {
                duration_secs: 1.0,
                leading_silence_secs: 0.0,
                trailing_silence_secs: 0.0,
            };
            2
        ];
        let (segments, total) = assemble_scene(&texts, &audio, &[true, false]);
        assert_eq!(
            segments[1].start_secs,
            1.0 + PAUSE_BETWEEN_SEGMENTS_SECS + PAUSE_PARAGRAPH_SECS
        );
        assert!((total - (segments[1].end_secs + PAUSE_AFTER_SCENE_SECS)).abs() < 1e-5);
    }
}
