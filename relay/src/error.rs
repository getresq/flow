use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

pub type RelayResult<T> = Result<T, RelayError>;

#[derive(Debug)]
pub enum RelayError {
    BadRequest(String),
    UnsupportedMediaType(String),
    Internal(String),
    Config(String),
}

impl RelayError {
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::BadRequest(message.into())
    }

    pub fn unsupported_media_type(message: impl Into<String>) -> Self {
        Self::UnsupportedMediaType(message.into())
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal(message.into())
    }

    pub fn config(message: impl Into<String>) -> Self {
        Self::Config(message.into())
    }

    fn status_code(&self) -> StatusCode {
        match self {
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::UnsupportedMediaType(_) => StatusCode::UNSUPPORTED_MEDIA_TYPE,
            Self::Internal(_) | Self::Config(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn body(&self) -> Value {
        match self {
            Self::BadRequest(message)
            | Self::UnsupportedMediaType(message)
            | Self::Internal(message)
            | Self::Config(message) => json!({ "error": message }),
        }
    }
}

impl IntoResponse for RelayError {
    fn into_response(self) -> Response {
        (self.status_code(), Json(self.body())).into_response()
    }
}
