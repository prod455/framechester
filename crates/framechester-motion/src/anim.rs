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
        Easing::CubicBezier { x1, y1, x2, y2 } => cubic_bezier(x1, y1, x2, y2, t),
    }
}

/// One coordinate of the cubic Bezier with endpoints 0 and 1 at parameter `s`.
fn bezier_axis(p1: f32, p2: f32, s: f32) -> f32 {
    let u = 1.0 - s;
    3.0 * u * u * s * p1 + 3.0 * u * s * s * p2 + s * s * s
}

fn bezier_axis_derivative(p1: f32, p2: f32, s: f32) -> f32 {
    let u = 1.0 - s;
    3.0 * u * u * p1 + 6.0 * u * s * (p2 - p1) + 3.0 * s * s * (1.0 - p2)
}

/// Evaluates `cubic-bezier(x1, y1, x2, y2)` at progress `t`: solves `x(s) = t`
/// for `s`, then returns `y(s)`. Pure and seekable — no clock, no state. The
/// solve is deterministic: Newton steps from `s = t`, falling back to a fixed
/// 32-step bisection whenever a step leaves `0..=1` or the slope vanishes
/// (with `x1`/`x2` clamped into `0..=1`, `x` is monotonic, so bisection
/// always converges). Endpoints are exact.
pub fn cubic_bezier(x1: f32, y1: f32, x2: f32, y2: f32, t: f32) -> f32 {
    if t <= 0.0 {
        return 0.0;
    }
    if t >= 1.0 {
        return 1.0;
    }
    let x1 = x1.clamp(0.0, 1.0);
    let x2 = x2.clamp(0.0, 1.0);
    let mut s = t;
    let mut solved = false;
    for _ in 0..8 {
        let error = bezier_axis(x1, x2, s) - t;
        if error.abs() < 1e-6 {
            solved = true;
            break;
        }
        let slope = bezier_axis_derivative(x1, x2, s);
        if slope.abs() < 1e-6 {
            break;
        }
        let next = s - error / slope;
        if !(0.0..=1.0).contains(&next) {
            break;
        }
        s = next;
    }
    if !solved {
        let (mut low, mut high) = (0.0f32, 1.0f32);
        s = t;
        for _ in 0..32 {
            let x = bezier_axis(x1, x2, s);
            if (x - t).abs() < 1e-6 {
                break;
            }
            if x < t {
                low = s;
            } else {
                high = s;
            }
            s = (low + high) / 2.0;
        }
    }
    bezier_axis(y1, y2, s)
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
    fn cubic_bezier_hits_endpoints_and_known_curves() {
        let identity = Easing::cubic_bezier(0.0, 0.0, 1.0, 1.0);
        for t in [0.0, 0.25, 0.5, 0.75, 1.0] {
            assert!((ease(identity, t) - t).abs() < 1e-4, "t={t}");
        }
        // CSS `ease` (0.25, 0.1, 0.25, 1) passes through ~0.8024 at t=0.5.
        let css_ease = Easing::cubic_bezier(0.25, 0.1, 0.25, 1.0);
        assert_eq!(ease(css_ease, 0.0), 0.0);
        assert_eq!(ease(css_ease, 1.0), 1.0);
        assert!((ease(css_ease, 0.5) - 0.8024).abs() < 1e-3);
        // Extreme control points still hit the endpoints exactly.
        let extreme = Easing::cubic_bezier(0.0, 2.0, 1.0, -1.0);
        assert_eq!(ease(extreme, 0.0), 0.0);
        assert_eq!(ease(extreme, 1.0), 1.0);
        assert!(ease(extreme, 0.3).is_finite());
    }

    #[test]
    fn cubic_bezier_is_monotonic_and_seekable() {
        // y within 0..=1 with x in 0..=1 gives a monotonic easing.
        let easing = Easing::cubic_bezier(0.42, 0.0, 0.58, 1.0);
        let mut previous = ease(easing, 0.0);
        for step in 1..=20 {
            let value = ease(easing, step as f32 / 20.0);
            assert!(value >= previous - 1e-5, "step {step}");
            previous = value;
        }
        // Seekable: evaluating the same instant twice is bit-identical.
        assert_eq!(ease(easing, 0.37), ease(easing, 0.37));
        // A track using it interpolates through the eased midpoint.
        let mut track = Track::constant(0.0);
        track.to(1.0, 1.0, 10.0, easing);
        assert!((track.eval(1.5) - 5.0).abs() < 1e-3);
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
