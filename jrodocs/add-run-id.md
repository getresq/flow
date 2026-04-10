# Add `run_id`

This document captures the recommended next step for making `Runs` in
`resq-flow` more coherent and more useful.

It is intentionally product-first. The point is not just to add one more field.
The point is to make `Runs` feel like one clean execution story across canvas,
logs, metrics, history, and run detail.

## Recommendation

Add a producer-owned `run_id` for the mail pipeline.

Use it as the stable execution identity for one concrete mail-processing
lifecycle, then carry it through all flow-visible events that belong to that
lifecycle.

Do **not** use `run_id` for every emitted event in the flow.

The key distinction is:

- `flow_id` means: this event belongs to the flow
- `run_id` means: this event belongs to one coherent execution story

That separation is the cleanest way to keep the product simple while still
preserving full visibility.

## Why This Is The PE Take

This is the principal-engineer version because it:

- keeps the telemetry model generic across flows
- avoids UI heuristics and domain-specific guessing
- avoids prop soup
- preserves one reusable mental model across live, history, graph, logs,
  metrics, and run detail
- keeps execution identity owned by the producer, where intent is actually known

It does **not** require adding lots of flags like:

- `is_background`
- `is_primary`
- `show_in_runs`
- `is_health_event`

Those kinds of fields turn into classification soup quickly.

Instead, the model stays small:

- all flow-visible events carry flow identity
- only execution-story events carry run identity

## Why This Moves `resq-flow` Toward A World-Class Product

The future-state product doc says:

- the product is one flow model across `Canvas`, `Metrics`, and `Logs`
- a run should feel like one coherent execution story
- node detail should explain meaning before exhaust
- the telemetry model must stay coherent across graph, logs, metrics, and run
  detail

See:

- [Future state](/Users/jeremyrojas/worktrees/resq-flow-docs/main/content/docs/product/future-state.mdx)

This `run_id` split supports that future state directly.

### The core product principle

Everything emitted can still be visible.

But not everything emitted should have equal prominence.

That means:

- graph can show all mapped flow activity
- logs can show all emitted flow logs
- node detail can show checks, outcomes, and local evidence
- `Runs` can stay the execution-story surface

This is the opposite of noisy observability tooling. It keeps the system honest
without making every surface equally loud.

## The Product Model

For the mail pipeline:

- mailbox polling, cursor updates, scheduler activity, and other ambient flow
  activity can still be visible in graph/logs/history
- only a concrete mail-processing lifecycle should become a `Run`

That means `Runs` should represent:

- one concrete processing lifecycle for one mailbox thread snapshot

Not:

- the entire mailbox
- every scheduler tick
- every "nothing found" poll

## What `run_id` Should Mean For Mail

`run_id` should identify:

- one mailbox thread
- at one concrete content snapshot
- across the full A-Z lifecycle for that snapshot

For phase 1, the recommended implementation is an opaque UUID-based run ID.

Conceptually:

```text
run_id = mail-pipeline_<uuid>
```

The important part is not the exact string shape. The important part is the
semantics:

- same thread, same content snapshot, retrying:
  - same `run_id`
- same thread, new inbound mail, new content snapshot:
  - new `run_id`
- poll/check finds nothing:
  - no `run_id`

For phase 1, the proposal keeps retries for the same accepted thread snapshot
under the same `run_id`.

If delayed retries later make one run feel too stretched out, the model can
evolve with lineage fields such as a retry or parent pointer. That is not
required to unlock the first useful version.

### Why phase 1 should use UUID

The point of `run_id` is stable execution identity, not clever string design.

For mail, the most important rule is:

- mint once when real work starts
- carry that same ID through the lifecycle
- reuse it for retries of the same lifecycle

`resq-agent` already uses `uuid` today, so UUID is the boring and consistent
choice.

We should not add a new ID dependency just to make run IDs look slightly nicer.

### When deterministic IDs may be worth it later

The deterministic hash model is still a valid future option if mail later needs
stronger idempotent identity semantics.

That would be useful if we want the same thread snapshot to recover the same
`run_id` even after rediscovery or rehydration from storage.

In that case, the likely seed fields would be:

- `provider`
- `mailbox_owner`
- `thread_id`
- `content_hash`

That is a phase 2 refinement, not the recommended phase 1 path.

## How To Use `run_id`

## 1. Mint it only when a real unit of work exists

Do not create `run_id` just because the flow is active.

Create it when the mail pipeline has accepted a changed thread snapshot as
downstream work and is about to enqueue or enter the concrete processing
lifecycle.

For mail, that should mean:

- the thread was discovered
- the content snapshot is real and changed
- the pipeline has decided this snapshot should enter downstream processing

In the current mail implementation, the cleanest mint point is the
ingest-to-extract handoff: when a stored thread becomes an `ExtractJob`.

That is the first place where:

- the poll found real work
- the thread was not skipped as cached/internal/no-op
- the pipeline is committing to downstream execution

That is the mint point.

## 2. Carry it through the whole run

Once minted, every flow-visible event that belongs to that lifecycle should
carry the same `run_id`.

That includes:

- ingest-related flow events after the thread snapshot becomes real work
- extract
- analyze
- draft
- send
- terminal result / failure
- retries for the same snapshot

If only some nodes carry `run_id`, the run fragments and the product loses the
coherent story.

`run_id` should also be treated as historically stable once the format is
adopted.

If the minting algorithm changes later, that change should apply only going
forward. Old IDs should remain valid historically.

## 3. Do not put it on ambient flow activity

These events can still be emitted and shown elsewhere, but should usually not
carry `run_id`:

- cron tick
- scheduler pulse
- mailbox poll with nothing found
- cursor-only maintenance
- other ambient discovery activity before a concrete mail unit exists

## Visibility vs prominence

This is the most important product distinction:

- no `run_id` does **not** mean "hide it"
- no `run_id` means "this is not a top-level execution story"

So:

- graph/canvas can still show it
- logs can still show it
- node detail can still show it
- history can still show it
- `Runs` should not treat it as a normal run row

That lets `resq-flow` stay calm without becoming blind.

## Labels and human context

`run_id` is execution identity, not the user-facing label.

The producer should keep emitting business attributes for labeling and filtering.
For mail, the most useful ones are:

- `thread_subject`
- `mailbox_owner`
- `thread_id`
- `content_hash`

`thread_subject` is a worthwhile small addition because it gives the future runs
surface a more human label without changing the execution model.

## High-Level Mail Implementation

## Producer-side changes

The producer should own the execution identity.

For mail, the implementation should:

1. Mint `run_id` when a concrete thread snapshot becomes real work.
2. Attach it to the job payload and flow context.
3. Reuse it on all downstream flow-visible events in that lifecycle.
4. Continue emitting the existing useful business identifiers:
   - `thread_subject`
   - `mailbox_owner`
   - `thread_id`
   - `content_hash`
5. Keep ambient scheduler and polling events flow-visible, but without
   `run_id`.

### Likely mail touchpoints

At a high level, this likely means:

- mint `run_id` where stored thread work becomes real, not at mailbox-level
  poll
- add `run_id` to queued extract work
- carry it through downstream worker telemetry and terminal flow events
- emit `thread_subject` anywhere the run should be easy to label later

The exact mail files are in the producer repo, but the important design rule is:

- `Cron Scheduler` and mailbox polling are flow-visible ambient activity
- `Incoming Queue` is where the concrete mail run begins
- once the run begins, downstream nodes keep the same `run_id`

### Shared helper shape in `resq-agent`

The PE take is:

- shared helper for generating run IDs
- flow-owned decision for when to mint them

So we should not build one global runtime service that decides run semantics for
every flow.

Instead:

- add a tiny shared helper that mints opaque UUID-based flow run IDs
- let each flow call that helper at its own mint point
- keep run-start policy in the flow code, not in shared infra

That keeps the system generic without turning shared code into a domain-policy
engine.

## `resq-flow` consumer status

`resq-flow` already understands `run_id` today.

When present, the UI already prefers `run_id` over `trace_id` as the execution
key.

That means:

- the core consumer model is already there
- the missing work is producer consistency, not UI invention

The main product change is therefore not "teach `resq-flow` what `run_id`
means." It is "start emitting the right `run_id` from the producer at the
right boundary."

- mailbox poll is a producer/check
- thread lifecycle is the run

## `resq-flow` changes

At a high level, `resq-flow` should:

1. Treat `run_id` as the canonical execution identity when present.
2. Keep using `flow_id` / `matched_flow_ids` for flow membership.
3. Preserve full graph/log visibility for flow events without `run_id`.
4. Make the `Runs` surface increasingly centered on `run_id`-backed execution
   stories.

Some of this already exists today:

- the UI execution key already prefers `run_id` over `trace_id`

But the product behavior should become more intentional over time:

- logs and canvas remain broad
- runs become story-shaped
- future health surfaces can notice when ambient machinery goes quiet

## Minimal data model

To avoid prop soup, the recommended model stays intentionally small:

- `flow_id`
- `run_id`
- `component_id`
- `component_kind`
- `step_id`
- existing business identifiers already useful for labeling and filtering

That is enough to support:

- one flow model
- coherent runs
- useful graph activity
- meaningful logs
- better run detail

without inventing a second classification system.

## Why Not Just Infer It In `resq-flow`

`resq-flow` can group and infer, but it cannot truly know producer intent.

For mail specifically:

- one poll can lead to zero, one, or many thread lifecycles
- the producer knows when a thread snapshot becomes real work
- the producer knows when retries still belong to the same lifecycle
- the producer knows when a new content snapshot means a new run

That knowledge belongs upstream.

The UI should present execution stories, not invent them.

## Recommended Phased Rollout

## Phase 1

Add `run_id` to the mail pipeline and carry it through the concrete mail
lifecycle.

Goal:

- better run grouping
- better run detail coherence
- better run filtering in logs/history/CLI

## Phase 2

Make the `Runs` surface explicitly more story-shaped while still keeping logs
and graph broad.

Goal:

- preserve full visibility
- reduce top-level noise
- prepare for better run labels and health signals

## Phase 3

Extend the same model generically to future flows:

- flow-visible activity everywhere
- execution-story identity only where real units of work exist

## Decision Summary

The right next step is:

- add a producer-owned `run_id`
- use it only for real mail-processing lifecycles
- carry it through all flow-visible events in that lifecycle
- keep ambient scheduler/poll/check activity visible elsewhere without making it
  a normal run row
- optionally emit `thread_subject` so the future label model can feel more human

This is the cleanest path toward a calmer, more intentional, more
world-class `resq-flow` product.

## Follow-On Documentation Alignment

After implementation lands, we should do one documentation alignment pass
across:

- repo-local docs in `resq-flow` such as `README.md`, `ARCHITECTURE.md`, and
  any other relevant contract or workflow docs
- the external docs project at
  `/Users/jeremyrojas/worktrees/resq-flow-docs/main` where the product model or
  flow concepts are described publicly

The goal of that pass is to make sure the producer-owned `run_id` model,
story-shaped `Runs`, and ambient-vs-run-backed visibility rules are described
consistently everywhere.
