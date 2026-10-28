use thiserror::Error;

#[derive(Debug, Error)]
pub enum FramechesterError {
    #[error("configuracao invalida: {0}")]
    Config(String),
    #[error("entrada invalida: {0}")]
    InvalidInput(String),
    #[error("nao encontrado: {0}")]
    NotFound(String),
    #[error("gate bloqueou: {0}")]
    GateBlocked(String),
    #[error("provider indisponivel: {0}")]
    Unavailable(String),
    #[error("operacao nao implementada: {0}")]
    NotImplemented(String),
    #[error("falha de rede: {0}")]
    Network(String),
    #[error("falha de IO: {0}")]
    Io(#[from] std::io::Error),
    #[error("falha de JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("falha externa: {0}")]
    External(String),
}

pub type Result<T> = std::result::Result<T, FramechesterError>;
