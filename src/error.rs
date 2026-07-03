#[derive(Debug, Clone)]
pub enum EngineError {
    ToolError(String),
}

impl std::fmt::Display for EngineError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EngineError::ToolError(s) => write!(f, "{}", s),
        }
    }
}

impl std::error::Error for EngineError {}
