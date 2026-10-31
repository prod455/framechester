//! Framechester motion engine: turns a semantic storyboard into animated frames,
//! synchronized captions, a mixed and normalized soundtrack, and a QA report.
//!
//! Pipeline: `Storyboard` → [`compose`] (scene graphs per format) → [`raster`] (frames
//! piped to FFmpeg) → [`audio`] (segments, pauses, music, SFX, loudness) → [`render`]
//! (mux, manifest, contact sheet) → [`qa`].
pub mod anim;
pub mod audio;
pub mod captions;
pub mod components;
pub mod compose;
pub mod format;
pub mod icons;
pub mod log;
pub mod narrate;
pub mod qa;
pub mod raster;
pub mod render;
pub mod scene;
pub mod text;
pub mod thumbnail;
pub mod tokens;
