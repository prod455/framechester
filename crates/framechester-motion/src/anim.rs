//! Keyframe tracks and easing. A track holds its first value before the first key and its
//! last value after the last key, so an element that was revealed stays revealed.
use framechester_core::storyboard::Easing;

pub fn ease(easing: Easing, t: f32) -> f32 {
    let t = t.clamp(0.0, 1.0);
    match easing {
        Easing::Linear => t,
        Easing::EaseOut => 1.0 - (1.0 - t).powi(3),
        Easing::EaseIn => t * t * t,
        Easing::EaseInOut => {
            if t < 0.5 {
                4.0 * t * t * t
            } else {
                1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
            }
        }
        Easing::Back => {
            let c1 = 1.70158;
            let c3 = c1 + 1.0;
            1.0 + c3 * (t - 1.0).powi(3) + c1 * (t - 1.0).powi(2)
        }
        Easing::Spring => {
            if t >= 1.0 {
                1.0
            } else {
                let c4 = (2.0 * std::f32::consts::PI) / 3.0;
                2.0f32.powf(-10.0 * t) * ((t * 10.0 - 0.75) * c4).sin() + 1.0
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Keyframe {
    pub t: f32,
    pub value: f32,
    /// Easing applied on the way *to* this key.
    pub easing: Easing,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Track {
    keys: Vec<Keyframe>,
}

impl Track {
    pub fn constant(value: f32) -> Self {
        Self {
            keys: vec![Keyframe {
                t: 0.0,
                value,
                easing: Easing::Linear,
            }],
        }
    }

    pub fn is_constant(&self) -> bool {
        self.keys.len() <= 1
    }

    /// Adds a key, keeping keys sorted by time. A later key at the same time replaces.
    pub fn key(&mut self, t: f32, value: f32, easing: Easing) -> &mut Self {
        match self.keys.iter().position(|key| key.t >= t) {
            Some(position) if (self.keys[position].t - t).abs() < 1e-4 => {
                self.keys[position] = Keyframe { t, value, easing };
            }
            Some(position) => self.keys.insert(position, Keyframe { t, value, easing }),
            None => self.keys.push(Keyframe { t, value, easing }),
        }
        self
    }

    /// Adds a segment from the current value at `start` to `value` at `start + duration`.
    pub fn to(&mut self, start: f32, duration: f32, value: f32, easing: Easing) -> &mut Self {
        let from = self.eval(start);
        self.key(start, from, Easing::Linear);
        self.key(start + duration.max(1e-3), value, easing);
        self
    }

    pub fn eval(&self, t: f32) -> f32 {
        match self.keys.len() {
            0 => 0.0,
            1 => self.keys[0].value,
            _ => {
                if t <= self.keys[0].t {
                    return self.keys[0].value;
                }
                let last = self.keys[self.keys.len() - 1];
                if t >= last.t {
                    return last.value;
                }
                let next = self
                    .keys
                    .iter()
                    .position(|key| key.t > t)
                    .unwrap_or(self.keys.len() - 1);
                let a = self.keys[next - 1];
                let b = self.keys[next];
                let span = (b.t - a.t).max(1e-6);
                let progress = ease(b.easing, (t - a.t) / span);
                a.value + (b.value - a.value) * progress
            }
        }
    }

    /// Times at which the value changes, for QA's visual-change count.
    pub fn change_times(&self) -> Vec<f32> {
        self.keys
            .windows(2)
            .filter(|pair| (pair[0].value - pair[1].value).abs() > 1e-4)
            .map(|pair| pair[0].t)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn easings_start_at_zero_and_end_at_one() {
        for easing in [
            Easing::Linear,
            Easing::EaseOut,
            Easing::EaseIn,
            Easing::EaseInOut,
            Easing::Back,
            Easing::Spring,
        ] {
            assert!((ease(easing, 0.0)).abs() < 1e-5, "{easing:?}");
            assert!((ease(easing, 1.0) - 1.0).abs() < 1e-5, "{easing:?}");
        }
        assert!(ease(Easing::Back, 0.7) > 1.0, "back overshoots");
    }

    #[test]
    fn tracks_hold_and_interpolate() {
        let mut track = Track::constant(0.0);
        track.to(1.0, 0.5, 1.0, Easing::Linear);
        assert_eq!(track.eval(0.0), 0.0);
        assert_eq!(track.eval(1.0), 0.0);
        assert!((track.eval(1.25) - 0.5).abs() < 1e-5);
        assert_eq!(track.eval(9.0), 1.0);
        track.to(3.0, 0.5, 0.0, Easing::EaseOut);
        assert_eq!(track.eval(2.0), 1.0);
        assert_eq!(track.eval(4.0), 0.0);
        assert_eq!(track.change_times().len(), 2);
    }
}
