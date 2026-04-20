use axum::Json;
use axum::extract::State;
use serde_json::{Value, json};

use crate::AppState;
use crate::error::{RelayError, RelayResult};
use crate::paths::env_or_package_or_source_dir;

pub async fn get_flow_definitions(
    State(state): State<AppState>,
) -> RelayResult<Json<serde_json::Value>> {
    let mut definitions = Vec::new();

    let Some(dir) = state.flow_definition_dir.as_ref() else {
        return Ok(Json(json!({ "flows": definitions })));
    };

    let mut entries = tokio::fs::read_dir(dir).await.map_err(|error| {
        RelayError::internal(format!(
            "failed to read flow definition directory `{}`: {error}",
            dir.display()
        ))
    })?;

    let mut paths = Vec::new();
    while let Some(entry) = entries.next_entry().await.map_err(|error| {
        RelayError::internal(format!(
            "failed to read flow definition entry in `{}`: {error}",
            dir.display()
        ))
    })? {
        let path = entry.path();
        if path
            .extension()
            .is_some_and(|extension| extension == "json")
        {
            paths.push(path);
        }
    }
    paths.sort();

    for path in paths {
        let raw = tokio::fs::read_to_string(&path).await.map_err(|error| {
            RelayError::internal(format!(
                "failed to read flow definition `{}`: {error}",
                path.display()
            ))
        })?;
        let value = serde_json::from_str::<Value>(&raw).map_err(|error| {
            RelayError::internal(format!(
                "failed to parse flow definition `{}`: {error}",
                path.display()
            ))
        })?;
        definitions.push(value);
    }

    Ok(Json(json!({ "flows": definitions })))
}

pub fn default_flow_definition_dir() -> std::path::PathBuf {
    env_or_package_or_source_dir(
        "RESQ_FLOW_CONFIG_DIR",
        "flows",
        "../ui/src/flow-definitions",
    )
}
