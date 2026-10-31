//! Narration segmentation and timing. A scene is narrated as one segment per sentence or
//! beat, each synthesized separately, so segment boundaries are real audio boundaries.
//! Word boundaries inside a segment are anchored on the pauses measured in its audio
//! (commas and breaths) and spread by syllables in between, unless a forced aligner
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
#[derive(Debug, Clone, PartialEq)]
pub struct SegmentAudio {
    pub duration_secs: f32,
    /// Silence before the first voiced sample.
    pub leading_silence_secs: f32,
    /// Silence after the last voiced sample.
    pub trailing_silence_secs: f32,
    /// Silent spans inside the voiced part, relative to the segment start, in order.
    pub pauses: Vec<(f32, f32)>,
}

/// Syllables of a word, the unit Portuguese speech advances by: groups of vowels, with
/// digits read as full numbers (about one and a half syllables each).
pub fn syllables(word: &str) -> usize {
    let mut count = 0usize;
    let mut digits = 0usize;
    let mut in_vowel = false;
    for character in word.chars().flat_map(char::to_lowercase) {
        if character.is_ascii_digit() {
            digits += 1;
            in_vowel = false;
        } else if "aeiouyáàâãéêíóôõúü".contains(character) {
            if !in_vowel {
                count += 1;
            }
            in_vowel = true;
        } else {
            in_vowel = false;
        }
    }
    (count + (digits * 3).div_ceil(2)).max(1)
}

/// A word that closes a phrase: the voice usually pauses after it.
fn ends_phrase(word: &str) -> bool {
    word.ends_with([',', ';', ':', '—', '–']) || word.ends_with("...")
}

/// Estimates word intervals inside the voiced part of a segment. Phrase ends (commas and
/// the like) are anchored on the measured pauses nearest to where the syllable count
/// expects them; inside each phrase words are spread by syllables over voiced time only,
/// so no word is placed in a silence. `offset_secs` is where the segment starts in the
/// scene.
pub fn estimate_words(text: &str, audio: &SegmentAudio, offset_secs: f32) -> Vec<TimedWord> {
    let words: Vec<&str> = text.split_whitespace().collect();
    if words.is_empty() {
        return Vec::new();
    }
    let voiced_start = audio.leading_silence_secs.max(0.0);
    let voiced_end =
        (audio.duration_secs - audio.trailing_silence_secs.max(0.0)).max(voiced_start + 0.05);
    let pauses: Vec<(f32, f32)> = audio
        .pauses
        .iter()
        .copied()
        .filter(|(start, end)| *start > voiced_start && *end < voiced_end && start < end)
        .collect();
    let weights: Vec<f32> = words.iter().map(|word| syllables(word) as f32).collect();
    let total: f32 = weights.iter().sum();
    // Phrases: runs of words up to a phrase end; each phrase end may claim one pause.
    let mut phrases: Vec<std::ops::Range<usize>> = Vec::new();
    let mut first = 0;
    for (index, word) in words.iter().enumerate() {
        if ends_phrase(word) && index + 1 < words.len() {
            phrases.push(first..index + 1);
            first = index + 1;
        }
    }
    phrases.push(first..words.len());
    let span = voiced_end - voiced_start;
    let mut boundaries = vec![voiced_start];
    let mut used = 0usize;
    let mut before = 0.0f32;
    // Expectations restart from the last anchored pause, so a comma anchored later than the
    // syllable count predicted never sends the next phrase back in time.
    let (mut anchor_time, mut anchor_weight) = (voiced_start, 0.0f32);
    for phrase in &phrases[..phrases.len() - 1] {
        before += weights[phrase.clone()].iter().sum::<f32>();
        let last = *boundaries.last().expect("starts with voiced_start");
        let expected = (anchor_time
            + (voiced_end - anchor_time) * (before - anchor_weight)
                / (total - anchor_weight).max(1e-3))
        .clamp(last, voiced_end);
        let nearest = pauses
            .iter()
            .enumerate()
            .skip(used)
            .filter(|(_, pause)| pause.0 >= last)
            .min_by(|a, b| {
                let distance = |pause: &(f32, f32)| ((pause.0 + pause.1) / 2.0 - expected).abs();
                distance(a.1).total_cmp(&distance(b.1))
            });
        match nearest {
            Some((index, pause)) if ((pause.0 + pause.1) / 2.0 - expected).abs() < span * 0.25 => {
                boundaries.push(pause.0);
                boundaries.push(pause.1);
                used = index + 1;
                (anchor_time, anchor_weight) = (pause.1, before);
            }
            _ => {
                boundaries.push(expected);
                boundaries.push(expected);
            }
        }
    }
    boundaries.push(voiced_end);
    let mut timed = Vec::with_capacity(words.len());
    for (phrase_index, phrase) in phrases.iter().enumerate() {
        let (start, end) = (
            boundaries[phrase_index * 2],
            boundaries[phrase_index * 2 + 1],
        );
        let gaps: Vec<(f32, f32)> = pauses
            .iter()
            .copied()
            .filter(|(a, b)| *a > start && *b < end)
            .collect();
        let spans = voiced_spans(start, end.max(start), &gaps);
        let voiced: f32 = spans.iter().map(|(a, b)| b - a).sum::<f32>().max(1e-3);
        let phrase_total: f32 = weights[phrase.clone()].iter().sum();
        let mut cumulative = 0.0f32;
        for index in phrase.clone() {
            let from = at_voiced(&spans, voiced * cumulative / phrase_total);
            cumulative += weights[index];
            let to = if index + 1 == phrase.end {
                end.max(from)
            } else {
                at_voiced(&spans, voiced * cumulative / phrase_total).max(from)
            };
            // A word never straddles a silence: it keeps the side with more voice.
            let (mut from, mut to) = (from, to);
            for (gap_start, gap_end) in &gaps {
                if *gap_start >= from && *gap_end <= to {
                    if gap_start - from >= to - gap_end {
                        to = *gap_start;
                    } else {
                        from = *gap_end;
                    }
                }
            }
            timed.push(TimedWord {
                text: words[index].to_string(),
                start_secs: offset_secs + from,
                end_secs: offset_secs + to.max(from),
            });
        }
    }
    // Last guard: words move forward and stay inside the voiced span, whatever the pauses.
    let mut cursor = offset_secs + voiced_start;
    for word in &mut timed {
        word.start_secs = word.start_secs.clamp(cursor, offset_secs + voiced_end);
        word.end_secs = word
            .end_secs
            .clamp(word.start_secs, offset_secs + voiced_end);
        cursor = word.end_secs;
    }
    timed
}

/// `[start, end]` minus the silent gaps, in order.
fn voiced_spans(start: f32, end: f32, gaps: &[(f32, f32)]) -> Vec<(f32, f32)> {
    let mut spans = Vec::new();
    let mut cursor = start;
    for (gap_start, gap_end) in gaps {
        if *gap_start > cursor {
            spans.push((cursor, *gap_start));
        }
        cursor = cursor.max(*gap_end);
    }
    if end > cursor {
        spans.push((cursor, end));
    }
    if spans.is_empty() {
        spans.push((start, end.max(start)));
    }
    spans
}

/// Absolute time after `offset` seconds of voiced time.
fn at_voiced(spans: &[(f32, f32)], mut offset: f32) -> f32 {
    for (start, end) in spans {
        if offset <= end - start {
            return start + offset;
        }
        offset -= end - start;
    }
    spans.last().map_or(0.0, |span| span.1)
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
        let words = estimate_words(text, measured, start);
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
            pauses: Vec::new(),
        };
        let words = estimate_words("Um agente decide, age e observa.", &audio, 10.0);
        assert_eq!(words.len(), 6);
        assert!((words[0].start_secs - 10.2).abs() < 1e-4);
        assert!((words.last().unwrap().end_secs - 12.7).abs() < 1e-4);
        for pair in words.windows(2) {
            assert!(pair[0].end_secs <= pair[1].start_secs + 1e-5);
        }
        assert!(words[2].end_secs - words[2].start_secs > words[4].end_secs - words[4].start_secs);
    }

    #[test]
    fn syllables_count_vowel_groups_and_digits() {
        assert_eq!(syllables("agente"), 3);
        assert_eq!(syllables("ação"), 2);
        assert_eq!(syllables("IA"), 1);
        assert_eq!(syllables("2025"), 6);
        assert_eq!(syllables("—"), 1);
    }

    #[test]
    fn a_comma_is_anchored_on_the_measured_pause_and_no_word_sits_in_silence() {
        // Voice from 0.1 to 2.9 s with a breath at 0.6-0.8 s and the comma pause at 1.6-1.9 s.
        let audio = SegmentAudio {
            duration_secs: 3.0,
            leading_silence_secs: 0.1,
            trailing_silence_secs: 0.1,
            pauses: vec![(0.6, 0.8), (1.6, 1.9)],
        };
        let words = estimate_words(
            "Primeiro o agente decide, depois ele age sozinho.",
            &audio,
            0.0,
        );
        let decide = words
            .iter()
            .position(|word| word.text == "decide,")
            .unwrap();
        assert!(
            (words[decide].end_secs - 1.6).abs() < 1e-4,
            "{:?}",
            words[decide]
        );
        assert!((words[decide + 1].start_secs - 1.9).abs() < 1e-4);
        for word in &words {
            let middle = (word.start_secs + word.end_secs) / 2.0;
            assert!(
                !(0.6..0.8).contains(&middle) && !(1.6..1.9).contains(&middle),
                "{word:?}"
            );
        }
        assert!((words.last().unwrap().end_secs - 2.9).abs() < 1e-4);
    }

    #[test]
    fn a_comma_anchored_late_never_sends_the_next_phrase_back_in_time() {
        // The first comma claims a pause later than expected; the second comma finds no
        // pause left and its expected time falls before the first one. Words must still
        // move forward and stay inside the voiced span.
        let audio = SegmentAudio {
            duration_secs: 3.0,
            leading_silence_secs: 0.0,
            trailing_silence_secs: 0.0,
            pauses: vec![(0.9, 1.0)],
        };
        for text in [
            "Um, dois, tres quatro cinco seis.",
            "Um, dois, tres, quatro, cinco e seis.",
        ] {
            let words = estimate_words(text, &audio, 2.0);
            let mut cursor = 2.0f32;
            for word in &words {
                assert!(word.start_secs >= cursor - 1e-4, "{text}: {words:?}");
                assert!(word.end_secs >= word.start_secs, "{text}: {words:?}");
                assert!(word.end_secs <= 5.0 + 1e-4, "{text}: {words:?}");
                cursor = word.end_secs;
            }
        }
    }

    #[test]
    fn assembled_scene_adds_pauses_and_total_duration() {
        let texts = vec!["Uma.".to_string(), "Duas.".to_string()];
        let audio = vec![
            SegmentAudio {
                duration_secs: 1.0,
                leading_silence_secs: 0.0,
                trailing_silence_secs: 0.0,
                pauses: Vec::new(),
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
