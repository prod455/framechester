//! Framechester CLI entry point. Arguments live in `cli`, behavior in `commands`.
mod cli;
mod commands;

use clap::Parser;
use cli::run;
use cli::Cli;

fn main() {
    let cli = Cli::parse();
    match run(cli) {
        Ok(code) => std::process::exit(code),
        Err(error) => {
            eprintln!("erro: {error:#}");
            std::process::exit(1);
        }
    }
}
