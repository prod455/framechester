//! One module per subcommand; `crate::cli::run` dispatches to them.
pub(crate) mod analytics;
pub(crate) mod doctor;
pub(crate) mod hyperframes;
pub(crate) mod produce;
pub(crate) mod qa;
pub(crate) mod report;
pub(crate) mod run;
