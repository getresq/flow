# resq-flow skills

These skills help developers and agents use `resq-flow` in a consistent way.

Use this folder as the quick "which skill do I want?" index.
Use each `SKILL.md` for the full instructions.

## Skill guide

| Skill | Use when | Do not use when |
| --- | --- | --- |
| `flow-cli-create` | You are creating a brand-new flow that should show up in `resq-flow` | You are only adding or changing logs inside an existing flow |
| `flow-cli-write` | You are adding or changing flow-visible logs for an existing flow | You are scaffolding a new flow from scratch |
| `flow-cli-read` | You want to inspect logs, tail live activity, or explain why a run stopped/failed/completed | You are writing producer-side telemetry |

## Choose the right skill

| Situation | Use | Why |
| --- | --- | --- |
| Brand-new pipeline or workflow should become a first-class `resq-flow` flow | `flow-cli-create` | Create the flow contract and the initial backbone logs |
| Existing flow needs more visibility around queue, worker, decision, or error areas | `flow-cli-write` | Add durable producer-side logs in code |
| "I want to add some logs, but I do not want a new flow" | `flow-cli-write` if an existing flow fits; otherwise use normal app logs | Do not create a new flow unless the user clearly wants one |
| You want to validate or troubleshoot an existing flow quickly | `flow-cli-read` | Inspect errors, history, runs, and live activity |
| The problem is not a `resq-flow` flow and should not become one | Do not use a `resq-flow` skill | Use regular service or infrastructure logs instead |

## Typical workflow

1. Use `flow-cli-create` to scaffold a new flow.
2. Use `flow-cli-write` to add or refine node logs and step logs.
3. Use `flow-cli-read` to validate the result with the CLI.

## Default routing rules

- Do not create a new flow unless the user explicitly wants a new first-class flow in `resq-flow`.
- If an existing flow already fits, prefer `flow-cli-write`.
- If no existing flow fits and the user does not want a new one, this is ordinary logging work, not a `resq-flow` skill task.
- Keep `resq-flow` focused on flow-visible logging, not generic application logging.

## Related local docs

- `../README.md`
- `../AGENTS.md`
- `../ARCHITECTURE.md`
- `../docs/flow-event-contract.md`
- `../docs/cli.md`
