//! One module per subcommand; `crate::cli::run` dispatches to them.
pub(crate) mod analytics;
pub(crate) mod backup;
pub(crate) mod doctor;
pub(crate) mod finance;
pub(crate) mod qa;
pub(crate) mod report;
pub(crate) mod run;
pub(crate) mod trends;
pub(crate) mod visuals;
