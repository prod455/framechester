//! `run`: the Studio's entry point. Every video goes through the motion engine; `short`
//! and `long` map to the vertical and horizontal formats of `produce`.
use crate::cli::{ProduceArgs, RunArgs};
use framechester_core::domain::ScriptFormat;
use std::path::PathBuf;

pub(crate) fn run_pipeline(path: &Option<PathBuf>, args: RunArgs) -> anyhow::Result<i32> {
    let format = match args
        .format
        .map(ScriptFormat::from)
        .unwrap_or(ScriptFormat::Short)
    {
        ScriptFormat::Short => "vertical",
        ScriptFormat::Long => "horizontal",
    };
    crate::commands::produce::produce(
        path,
        ProduceArgs {
            script: Some(args.script),
            storyboard: None,
            topic: Some(args.topic),
            topic_index: args.topic_index,
            format: Some(format.into()),
            channel: args.channel,
            episode: None,
            workdir: args.workdir,
            output: None,
            voice: args.voice,
            look: None,
            preview_only: args.preview_only,
            json: args.json,
        },
    )
}
