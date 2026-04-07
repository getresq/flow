---
name: flow-cli-read
description: Use this skill when the user wants to inspect, filter, or tail logs with the resq-flow CLI. It covers relay status checks, `resq-flow logs errors`, `resq-flow logs list`, and `resq-flow logs tail`, including flow-scoped usage like `--flow mail-pipeline`, global usage like `--all`, and quick validation of whether a log should appear in a specific flow.
---

# resq-flow CLI

Use this skill when the task is about operating `resq-flow` from the terminal:

- check relay status
- find recent failures or retryable critical conditions with `logs errors`
- inspect history with `logs list`
- watch live logs with `logs tail`
- explain why a run stopped, failed, or completed with `runs explain`
- confirm whether a log belongs to a specific flow such as `mail-pipeline`

Do not use this skill when the main task is to add durable runtime instrumentation in another repo. Use the producer-side write skill for that.

## Quick Context

Start with the local docs and contract:

- `README.md` for the repo doc map and command examples
- `AGENTS.md` for repo guardrails and the agent read order
- `ARCHITECTURE.md` for topology and ownership
- `docs/cli.md` for command usage and examples
- `docs/flow-event-contract.md` for flow/run/node/step semantics
- `ui/src/flow-contracts/*.json` for valid flow IDs and telemetry matching rules
- `cli/src/commands/logs.ts` and `cli/src/commands/runs.ts` if behavior needs confirmation

If the user names a flow, use it. If the user names `resq-flow` but not the flow, infer it from context when that is obvious. If not, ask one short question.

If the user asks for "logs" without saying whether they want `resq-flow` or raw logs, clarify briefly:

- `resq-flow` is for flow-aware logs with run/step context
- raw logs are for broad service or infrastructure log digging

## Rules

- Treat flow scope as explicit.
- A log belongs to a flow only when it is explicitly flow-scoped or relay-matched.
- For `logs errors`, `logs list`, and `logs tail`, use exactly one of `--flow <flow-id>` or `--all`.
- Do not fake flow scope with `--attr flow_id=...`; scope comes from command flags.
- Do not describe unscoped or global logs as flow logs.
- Prefer flow-scoped inspection over `--all` unless the user explicitly wants global or cross-flow reads.

## Workflow

1. Confirm or infer the target flow ID.
2. For relay health, run `resq-flow status`.
3. For failures, retries, or attention-worthy conditions, start with `resq-flow logs errors`.
4. For broader historical inspection, use `resq-flow logs list`.
5. For "why did this run stop or fail?", use `resq-flow runs explain`.
6. For live inspection, use `resq-flow logs tail`.
7. If `resq-flow` is empty or inconclusive, say that clearly and widen to regular Victoria or raw service logs in the user's normal log tooling.
8. Report the exact command used, the scope chosen, and what you observed.

## Common Patterns

```bash
resq-flow status
resq-flow logs errors --flow mail-pipeline
resq-flow logs errors --flow mail-pipeline --hard-only --json
resq-flow logs list --flow mail-pipeline --window 15m
resq-flow runs explain --flow mail-pipeline --thread <thread_id>
resq-flow logs list --all --limit 100
resq-flow logs tail --flow mail-pipeline --attr thread_id=<thread_id>
resq-flow logs tail --all --jsonl
```

## Validation Guidance

- Prefer `logs errors` for "what failed, retried, or needs attention right now?"
- Prefer `logs tail` for "is it happening right now?"
- Prefer `logs list` for "did it show up in history?"
- Prefer `runs explain` for "why did this stop, fail, or complete?"
- If `logs errors` is empty, do not keep retrying the same narrow command shape. Broaden to `logs list`, then `runs explain` or `logs tail` as appropriate.
- If the flow-aware `resq-flow` views still do not explain the issue, explicitly recommend widening to regular Victoria or raw service logs.
- If the work is really about adding or changing instrumentation, stop and route back to `flow-cli-write`.
- When checking a specific execution, filter with `thread_id`, `run_id`, `step_id`, or `status` when available.
- `logs errors` is the default command when the user asks for failures, retries, or critical conditions.
- Keep the distinction clear:
  - raw attrs use child-only `step_id` values such as `final-result`
  - human-facing references use `component_id.step_id` such as `analyze-decision.final-result`
- If a log does not appear in a flow, check whether the wrong scope was used before assuming relay or UI bugs.
- Remember that ordinary unmatched runtime logs are not the main thing `resq-flow` surfaces today; flow logs are the normal path.
