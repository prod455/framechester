//! Duration of a 16-bit PCM WAV written by the narration engine, read from its header.
use std::path::Path;

pub fn wav_metadata(bytes: &[u8]) -> Option<(u32, f32)> {
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return None;
    }
    let mut offset = 12usize;
    let mut sample_rate = 0u32;
    let mut channels = 0u16;
    let mut bits = 0u16;
    let mut data_size = 0u32;
    while offset + 8 <= bytes.len() {
        let id = &bytes[offset..offset + 4];
        let size = u32::from_le_bytes([
            bytes[offset + 4],
            bytes[offset + 5],
            bytes[offset + 6],
            bytes[offset + 7],
        ]) as usize;
        let payload = offset + 8;
        if payload + size > bytes.len() {
            break;
        }
        if id == b"fmt " && size >= 16 {
            channels = u16::from_le_bytes([bytes[payload + 2], bytes[payload + 3]]);
            sample_rate = u32::from_le_bytes([
                bytes[payload + 4],
                bytes[payload + 5],
                bytes[payload + 6],
                bytes[payload + 7],
            ]);
            bits = u16::from_le_bytes([bytes[payload + 14], bytes[payload + 15]]);
        } else if id == b"data" {
            data_size = size as u32;
            break;
        }
        offset = payload + size + (size % 2);
    }
    if sample_rate == 0 || channels == 0 || bits == 0 || data_size == 0 {
        return None;
    }
    let bytes_per_second = sample_rate as f32 * channels as f32 * (bits as f32 / 8.0);
    if bytes_per_second <= 0.0 {
        return None;
    }
    Some((sample_rate, data_size as f32 / bytes_per_second))
}

pub fn probe_wav(path: &Path) -> Option<(u32, f32)> {
    let bytes = std::fs::read(path).ok()?;
    wav_metadata(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tiny_wav(sample_rate: u32, channels: u16, bits: u16, frames: u32) -> Vec<u8> {
        let data_size = frames * channels as u32 * (bits as u32 / 8);
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"RIFF");
        bytes.extend_from_slice(&(36 + data_size).to_le_bytes());
        bytes.extend_from_slice(b"WAVE");
        bytes.extend_from_slice(b"fmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());
        bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&channels.to_le_bytes());
        bytes.extend_from_slice(&sample_rate.to_le_bytes());
        bytes.extend_from_slice(&(sample_rate * channels as u32 * (bits as u32 / 8)).to_le_bytes());
        bytes.extend_from_slice(&(channels * (bits / 8)).to_le_bytes());
        bytes.extend_from_slice(&bits.to_le_bytes());
        bytes.extend_from_slice(b"data");
        bytes.extend_from_slice(&data_size.to_le_bytes());
        bytes.resize(bytes.len() + data_size as usize, 0);
        bytes
    }

    #[test]
    fn parses_wav_metadata() {
        let bytes = tiny_wav(22_050, 1, 16, 22_050);
        let (rate, duration) = wav_metadata(&bytes).unwrap();
        assert_eq!(rate, 22_050);
        assert!((duration - 1.0).abs() < 0.001);
    }

    #[test]
    fn rejects_non_wav() {
        assert!(wav_metadata(b"not a wav").is_none());
    }
}
