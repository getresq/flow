use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::{RelayError, RelayResult};
use crate::models::{FlowEvent, infer_error_state};

const DEFAULT_CONTRACT_DIR: &str = "../ui/src/flow-contracts";
const TRACE_CONTEXT_TTL_SECS: i64 = 30 * 60;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FlowContract {
    pub version: u32,
    pub id: String,
    pub name: String,
    pub telemetry: FlowTelemetryContract,
    pub keep_context: FlowKeepContext,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct FlowTelemetryContract {
    #[serde(default)]
    pub log_events: Vec<String>,
    #[serde(default)]
    pub queue_prefixes: Vec<String>,
    #[serde(default)]
    pub function_prefixes: Vec<String>,
    #[serde(default)]
    pub worker_prefixes: Vec<String>,
    #[serde(default)]
    pub stage_prefixes: Vec<String>,
    #[serde(default)]
    pub span_prefixes: Vec<String>,
    #[serde(default)]
    pub span_names: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct FlowKeepContext {
    #[serde(default)]
    pub parent_spans: bool,
    #[serde(default)]
    pub root_spans: bool,
    #[serde(default)]
    pub error_events: bool,
    #[serde(default)]
    pub unmapped_events_for_kept_traces: bool,
}

#[derive(Debug, Clone)]
pub struct FlowRegistry {
    contracts: Arc<Vec<FlowContract>>,
}

impl FlowRegistry {
    pub fn load_default() -> RelayResult<Self> {
        let path = std::env::var("RESQ_FLOW_CONTRACT_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(DEFAULT_CONTRACT_DIR));
        Self::load_from_dir(&path)
    }

    pub fn load_from_dir(path: &Path) -> RelayResult<Self> {
        let dir = fs::read_dir(path).map_err(|error| {
            RelayError::config(format!(
                "failed to read flow contract directory `{}`: {error}",
                path.display()
            ))
        })?;

        let mut contracts = Vec::new();
        for entry in dir {
            let entry = entry.map_err(|error| {
                RelayError::config(format!(
                    "failed to read flow contract entry in `{}`: {error}",
                    path.display()
                ))
            })?;
            let entry_path = entry.path();
            if entry_path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let raw = fs::read_to_string(&entry_path).map_err(|error| {
                RelayError::config(format!(
                    "failed to read flow contract `{}`: {error}",
                    entry_path.display()
                ))
            })?;
            let contract = serde_json::from_str::<FlowContract>(&raw).map_err(|error| {
                RelayError::config(format!(
                    "failed to parse flow contract `{}`: {error}",
                    entry_path.display()
                ))
            })?;
            contracts.push(contract);
        }

        contracts.sort_by(|left, right| left.id.cmp(&right.id));
        if contracts.is_empty() {
            return Err(RelayError::config(format!(
                "no flow contracts found in `{}`",
                path.display()
            )));
        }

        Ok(Self {
            contracts: Arc::new(contracts),
        })
    }

    pub fn all(&self) -> &[FlowContract] {
        self.contracts.as_slice()
    }

    pub fn find(&self, flow_id: &str) -> Option<&FlowContract> {
        self.contracts
            .iter()
            .find(|contract| contract.id == flow_id)
    }

    pub fn history_log_query(
        &self,
        flow_id: Option<&str>,
        search: Option<&str>,
        attr_filters: &[(String, String)],
    ) -> Option<String> {
        let log_events = self.log_events(flow_id);
        if log_events.is_empty() {
            return None;
        }

        let mut query = if log_events.len() == 1 {
            format!("event:{}", quote_logsql_string(&log_events[0]))
        } else {
            let clauses = log_events
                .iter()
                .map(|event| format!("event:{}", quote_logsql_string(event)))
                .collect::<Vec<_>>();
            format!("({})", clauses.join(" or "))
        };

        // Keep the backend query broad and let relay-side contract matching decide flow
        // ownership. History needs to surface matched_flow_ids-only logs too, not just logs
        // with an explicit flow_id field already persisted in storage.

        if let Some(term) = search.map(str::trim).filter(|term| !term.is_empty()) {
            let quoted = quote_logsql_string(term);
            let clauses = [
                format!("flow_id:{quoted}"),
                format!("run_id:{quoted}"),
                format!("component_id:{quoted}"),
                format!("trace_id:{quoted}"),
                format!("job_id:{quoted}"),
                format!("request_id:{quoted}"),
                format!("thread_id:{quoted}"),
                format!("reply_draft_id:{quoted}"),
                format!("journey_key:{quoted}"),
                format!("stage_id:{quoted}"),
                format!("function_name:{quoted}"),
                format!("queue_name:{quoted}"),
                format!("worker_name:{quoted}"),
            ];
            query.push_str(" and (");
            query.push_str(&clauses.join(" or "));
            query.push(')');
        }

        if !attr_filters.is_empty() {
            for (key, value) in attr_filters {
                query.push_str(" and ");
                query.push_str(key);
                query.push(':');
                query.push_str(&quote_logsql_string(value));
            }
        }

        Some(query)
    }

    fn log_events(&self, flow_id: Option<&str>) -> Vec<String> {
        let mut values = BTreeSet::new();
        for contract in self.contracts.iter() {
            if flow_id.is_some_and(|selected| selected != contract.id) {
                continue;
            }
            for event_name in &contract.telemetry.log_events {
                values.insert(event_name.clone());
            }
        }
        values.into_iter().collect()
    }
}

#[derive(Debug, Clone)]
pub struct FlowMatcher {
    registry: FlowRegistry,
    trace_context: Arc<tokio::sync::Mutex<HashMap<String, TraceContext>>>,
}

#[derive(Debug, Clone)]
struct TraceContext {
    flow_ids: Vec<String>,
    updated_at: DateTime<Utc>,
}

impl FlowMatcher {
    pub fn new(registry: FlowRegistry) -> Self {
        Self {
            registry,
            trace_context: Arc::new(tokio::sync::Mutex::new(HashMap::new())),
        }
    }

    pub fn registry(&self) -> &FlowRegistry {
        &self.registry
    }

    pub async fn filter_live_events(&self, events: Vec<FlowEvent>) -> Vec<FlowEvent> {
        let now = Utc::now();
        let persisted_context = {
            let mut trace_context = self.trace_context.lock().await;
            prune_trace_context(&mut trace_context, now);
            trace_context
                .iter()
                .map(|(trace_id, context)| (trace_id.clone(), context.flow_ids.clone()))
                .collect::<HashMap<_, _>>()
        };

        let filtered = filter_events(&self.registry, events, &persisted_context, None);

        let mut trace_context = self.trace_context.lock().await;
        prune_trace_context(&mut trace_context, now);
        for event in &filtered {
            let Some(trace_id) = event.trace_id.as_ref() else {
                continue;
            };
            if event.matched_flow_ids.is_empty() {
                continue;
            }
            trace_context.insert(
                trace_id.clone(),
                TraceContext {
                    flow_ids: event.matched_flow_ids.clone(),
                    updated_at: now,
                },
            );
        }

        filtered
    }

    pub fn filter_history_events(
        &self,
        events: Vec<FlowEvent>,
        flow_id: Option<&str>,
    ) -> Vec<FlowEvent> {
        filter_events(&self.registry, events, &HashMap::new(), flow_id)
    }
}

fn filter_events(
    registry: &FlowRegistry,
    events: Vec<FlowEvent>,
    persisted_context: &HashMap<String, Vec<String>>,
    selected_flow_id: Option<&str>,
) -> Vec<FlowEvent> {
    let direct_matches = events
        .iter()
        .map(|event| match_contracts(registry, event))
        .collect::<Vec<_>>();

    let mut trace_flow_ids = persisted_context
        .iter()
        .map(|(trace_id, flow_ids)| {
            (
                trace_id.clone(),
                flow_ids.iter().cloned().collect::<BTreeSet<_>>(),
            )
        })
        .collect::<HashMap<_, _>>();

    for (event, matched) in events.iter().zip(direct_matches.iter()) {
        let Some(trace_id) = event.trace_id.as_ref() else {
            continue;
        };
        let trace_entry = trace_flow_ids.entry(trace_id.clone()).or_default();
        for flow_id in matched {
            trace_entry.insert(flow_id.clone());
        }
    }

    let mut filtered = Vec::new();
    for (mut event, direct_flow_ids) in events.into_iter().zip(direct_matches.into_iter()) {
        let has_explicit_flow_id = explicit_flow_id(&event).is_some();
        let mut matched_flow_ids = BTreeSet::new();
        for flow_id in direct_flow_ids {
            if selected_flow_id.is_none_or(|selected| selected == flow_id) {
                matched_flow_ids.insert(flow_id);
            }
        }

        if let Some(trace_id) = event.trace_id.as_ref()
            && !has_explicit_flow_id
            && let Some(trace_flows) = trace_flow_ids.get(trace_id)
        {
            for flow_id in trace_flows {
                if selected_flow_id.is_some_and(|selected| selected != flow_id) {
                    continue;
                }
                if matched_flow_ids.contains(flow_id) {
                    continue;
                }
                let Some(contract) = registry.find(flow_id) else {
                    continue;
                };
                if should_keep_context(contract, &event) {
                    matched_flow_ids.insert(flow_id.clone());
                }
            }
        }

        if matched_flow_ids.is_empty() {
            continue;
        }
        event.matched_flow_ids = matched_flow_ids.into_iter().collect();
        filtered.push(event);
    }

    filtered
}

fn match_contracts(registry: &FlowRegistry, event: &FlowEvent) -> Vec<String> {
    if let Some(flow_id) = explicit_flow_id(event) {
        return registry
            .find(&flow_id)
            .map(|contract| vec![contract.id.clone()])
            .unwrap_or_default();
    }

    let mut matched = Vec::new();
    for contract in registry.all() {
        if matches_contract(contract, event) {
            matched.push(contract.id.clone());
        }
    }
    matched
}

fn matches_contract(contract: &FlowContract, event: &FlowEvent) -> bool {
    let telemetry = &contract.telemetry;
    let event_name = event.attr_string("event");
    if event_name
        .as_deref()
        .is_some_and(|candidate| telemetry.log_events.iter().any(|value| value == candidate))
    {
        return true;
    }

    let queue_candidates = [
        event.attr_string("queue_name"),
        event.attr_string("rrq.queue"),
        event.attr_string("messaging.destination.name"),
    ];
    if matches_prefixes(&queue_candidates, &telemetry.queue_prefixes) {
        return true;
    }

    let function_candidates = [
        event.attr_string("function_name"),
        event.attr_string("rrq.function"),
        event.attr_string("messaging.operation"),
        event.span_name.clone(),
    ];
    if matches_prefixes(&function_candidates, &telemetry.function_prefixes) {
        return true;
    }

    let worker_candidates = [event.attr_string("worker_name")];
    if matches_prefixes(&worker_candidates, &telemetry.worker_prefixes) {
        return true;
    }

    let stage_candidates = [event.attr_string("stage_id")];
    if matches_prefixes(&stage_candidates, &telemetry.stage_prefixes) {
        return true;
    }

    if event
        .span_name
        .as_deref()
        .is_some_and(|candidate| telemetry.span_names.iter().any(|value| value == candidate))
    {
        return true;
    }

    matches_prefixes(
        std::slice::from_ref(&event.span_name),
        &telemetry.span_prefixes,
    )
}

fn explicit_flow_id(event: &FlowEvent) -> Option<String> {
    event
        .attr_string("flow_id")
        .filter(|value| !value.trim().is_empty())
}

fn matches_prefixes(candidates: &[Option<String>], prefixes: &[String]) -> bool {
    candidates
        .iter()
        .flatten()
        .any(|candidate| prefixes.iter().any(|prefix| candidate.starts_with(prefix)))
}

fn should_keep_context(contract: &FlowContract, event: &FlowEvent) -> bool {
    if contract.keep_context.unmapped_events_for_kept_traces {
        return true;
    }
    if contract.keep_context.error_events && infer_error_state(event) {
        return true;
    }
    if contract.keep_context.parent_spans && event.parent_span_id.is_some() {
        return true;
    }
    contract.keep_context.root_spans && event.parent_span_id.is_none()
}

fn prune_trace_context(trace_context: &mut HashMap<String, TraceContext>, now: DateTime<Utc>) {
    let threshold = now - chrono::Duration::seconds(TRACE_CONTEXT_TTL_SECS);
    trace_context.retain(|_, context| context.updated_at >= threshold);
}

fn quote_logsql_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for char in value.chars() {
        match char {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            _ => out.push(char),
        }
    }
    out.push('"');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn contract(id: &str, log_events: &[&str]) -> FlowContract {
        FlowContract {
            version: 1,
            id: id.to_string(),
            name: id.to_string(),
            telemetry: FlowTelemetryContract {
                log_events: log_events
                    .iter()
                    .map(|value| (*value).to_string())
                    .collect(),
                ..FlowTelemetryContract::default()
            },
            keep_context: FlowKeepContext::default(),
        }
    }

    #[test]
    fn selected_flow_history_query_keeps_shared_event_query_broad_for_post_filtering() {
        let registry = FlowRegistry {
            contracts: Arc::new(vec![
                contract("mail-pipeline", &["flow_event"]),
                contract("nora-pipeline", &["flow_event"]),
            ]),
        };

        let query = registry
            .history_log_query(Some("mail-pipeline"), None, &[])
            .expect("query");

        assert_eq!(query, r#"event:"flow_event""#);
    }

    #[test]
    fn unselected_history_query_keeps_shared_event_query_broad() {
        let registry = FlowRegistry {
            contracts: Arc::new(vec![
                contract("mail-pipeline", &["flow_event"]),
                contract("nora-pipeline", &["flow_event"]),
            ]),
        };

        let query = registry.history_log_query(None, None, &[]).expect("query");

        assert_eq!(query, r#"event:"flow_event""#);
    }

    #[test]
    fn selected_flow_history_query_appends_exact_attribute_filters() {
        let registry = FlowRegistry {
            contracts: Arc::new(vec![contract("mail-pipeline", &["flow_event"])]),
        };

        let query = registry
            .history_log_query(
                Some("mail-pipeline"),
                None,
                &[
                    ("thread_id".to_string(), "thread-201".to_string()),
                    ("status".to_string(), "error".to_string()),
                ],
            )
            .expect("query");

        assert_eq!(
            query,
            r#"event:"flow_event" and thread_id:"thread-201" and status:"error""#
        );
    }
}
