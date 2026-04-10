# Skills Refactor Plan

This document captures the current plan for improving the `resq-flow` skills so
they are easier for humans and agents to use end-to-end.

## Goal

The desired experience is:

- a user says "create a new flow"
- the agent uses `flow-cli-create`
- producer telemetry is added
- `resq-flow` is updated correctly
- the flow is visible and usable by the end of the skill

That means the skill should leave the user with a flow that is at least smoke
validated, not just partially scaffolded.

## Current Gaps

- `flow-cli-create` talks mostly about producer-side flow creation and does not
  clearly spell out all required `resq-flow` integration steps.
- The current UI registry model is easy to miss:
  - relay auto-loads JSON contracts
  - UI flow registration is still manual in `ui/src/flows/index.ts`
- The default path for a new flow is not explicit enough:
  - headless flow first should be the default
  - graph view should be optional
- Validation boundaries are fuzzy:
  - smoke validation is required
  - full live E2E should be optional
- Failure modes are too easy to misread:
  - missing UI registration can feel like the flow is broken instead of
    incomplete

## Refactor Principles

- Keep the skill structure simple: `create`, `write`, `read`
- Make `create` semi-interactive, not a giant one-shot automation blob
- Default to headless flow creation unless the user explicitly wants a graph now
- Make the definition of done explicit
- Keep deep validation and troubleshooting routed through `flow-cli-read`

## Planned Changes

## 1. Update `skills/flow-cli-create/SKILL.md`

### Add explicit `resq-flow` integration steps

The skill should say clearly that new-flow creation includes:

- producer-side telemetry scaffold
- `ui/src/flow-contracts/<flow-id>.json`
- UI registration in `ui/src/flows/index.ts`
- optional `ui/src/flows/<flow-id>.ts` for graph view

### Make the interaction model explicit

The skill should gather only the minimum decisions needed when not obvious:

- flow name / `flow_id`
- unit of work / run identity
- headless now or graph now
- smoke validation only or full live E2E now

### Make headless the default creation path

The default create flow should be:

- create contract
- register flow
- no graph unless explicitly requested

### Add a definition of done

The skill should not stop at "files created".

Required done state:

- producer emits the flow telemetry
- `resq-flow` recognizes the flow
- the flow appears in the UI
- `/flows/<flow-id>` resolves
- smoke validation is complete

### Add validation boundaries

Required:

- smoke validation via CLI and route/UI presence

Optional:

- full live E2E

If deeper validation is needed, the skill should route to `flow-cli-read`.

## 2. Update `skills/flow-cli-write/SKILL.md`

Clarify that `write` is:

- for existing flows only
- the follow-on skill after `create` when more telemetry refinement is needed
- not responsible for new flow registration or initial scaffolding

This skill already covers producer-side instrumentation well, so the change is
mostly positioning and handoff clarity.

## 3. Update `skills/flow-cli-read/SKILL.md`

Add a "new flow smoke validation" use case.

This should cover:

- relay reachability
- `logs list` / `logs tail` for the new flow
- route validation for `/flows/<flow-id>`
- history visibility confirmation when relevant

This becomes the standard escalation path after `create` for deeper validation.

## 4. Update `skills/README.md`

Make the lifecycle clearer:

1. `flow-cli-create`
2. `flow-cli-read` for validation
3. `flow-cli-write` for iterative refinement

Also add one sentence that a new flow is not complete until both producer and
`resq-flow` integration are done.

## 5. Tighten repo docs

Update `README.md` and possibly `ARCHITECTURE.md` to make the current registry
model explicit:

- relay auto-loads JSON contracts
- UI still needs manual flow registration today
- `flow.ts` is optional and only needed for rich graph view

## Recommended Product/DX Follow-Ups

These are adjacent to the skill refactor and would reduce confusion further:

- make unknown flow routes fail clearly instead of silently bouncing to the
  first known flow
- consider dynamic UI discovery of all contracts as headless flows
- keep graph view optional

## Important Product Thread To Continue

Separate from the skills work, the other major thread is the `Runs` model:

- `Runs` should become more useful and more stable across flows
- producer-side `run_id` is likely the key missing execution identifier
- `run_id` should be minted when a real unit of work begins
- `Runs` should reflect meaningful flow executions, not just raw traces

That thread should continue after the skill refactor notes are captured.
