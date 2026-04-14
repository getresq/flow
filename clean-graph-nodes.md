# Clean Graph Nodes

Use this file when cleaning up or refactoring a flow section in `resq-flow`.

This is not generic diagram advice. It is the practical guidance we learned while cleaning up the mail pipeline cron scheduler section.

## First Principle

Every graph decision must be rooted in 100% confidence about how the real system works.

- Do not guess.
- Do not infer from names alone.
- Do not simplify a path unless we have verified the actual runtime behavior in `resq-agent`.
- If a node, edge, read, write, queue handoff, or worker boundary is unclear, stop and verify it in code first.

The graph should be honest to runtime, not just visually neat.

## Terminology

Use these terms consistently:

- `Primary nodes`
  - first-class graph nodes the operator should reason about at a glance
  - examples: queues, workers, schedulers, decisions, major resources
- `Step nodes`
  - smaller detail nodes for meaningful sub-steps inside a section
  - use these when the step is operationally real and helpful for debugging
- `Resource nodes`
  - stores like Postgres or S3
- `Groups`
  - visual containers only when truly needed
  - do not use a gray grouping box by default

## Core Rules

### 1. Verify before simplifying

Before changing a flow section:

- find the real producer / worker / route in `resq-agent`
- verify what it reads
- verify what it writes
- verify what it enqueues
- verify where it stops
- verify whether a branch is real or only implied by naming

If we are not 100% sure, we should not “clean up” the graph yet.

### 2. Prefer sparse primary structure + useful step detail

We want:

- a sparse, readable top-level graph
- enough step detail to debug real production behavior

We do not want:

- every implementation function turned into a node
- giant unlabeled gray boxes doing all the work
- hidden behavior that makes prod debugging harder

### 3. Use step nodes when the runtime boundary is real

Use a step node when the thing is a real runtime action the operator may need to inspect.

Good examples:

- scheduling work
- enqueueing follow-on jobs
- writing a cursor
- writing metadata
- making a decision that changes downstream behavior

Avoid step nodes for:

- tiny implementation details with no operator value
- code-level helper calls
- names that only mirror function internals

### 4. Remove gray grouping boxes unless they are actually helping

Default stance:

- do not use the gray group box

If the section is readable with individual step nodes, prefer:

- one primary node
- a few step nodes beneath or beside it
- direct edges between them

Use a gray group only when it truly improves comprehension for a dense local cluster.

### 5. Edge labels are usually a “nay”

Default:

- no edge captions

Edge captions often add implementation noise and clutter the canvas.

If information is important:

- prefer putting it in the node description
- or in node notes
- or by making a real step node

Keep edge labels only when they are the clearest, shortest possible way to disambiguate something truly confusing.

### 6. Add notes to nodes to replace missing edge context

Notes are the preferred place for useful operator context.

Use notes to explain:

- what kind of work passes through a queue
- what a worker picks up
- what a scheduler reads
- what a step writes
- important stop conditions
- important assumptions or special cases

This is often better than edge captions.

### 7. Add notes to DB/resource nodes

If a Postgres or S3 node is shown, it should usually explain what lives there.

Examples:

- which tables are read
- which tables are written
- whether it stores raw artifacts vs normalized metadata
- whether the resource is mailbox-level, thread-level, or run-level

Resource nodes should not be vague if they are on the graph.

### 8. Default edge direction rule

Unless there is a strong reason not to:

- edges should enter nodes from the top
- edges should leave nodes from the bottom

This creates the cleanest mental model for most flows.

Use side handles only when needed to avoid ambiguity or ugly crossings.

Examples where side handles are reasonable:

- writing from a step node into a nearby DB cylinder
- branching around a node to avoid a crossing
- feeding a queue from a side path without punching through another node

### 9. Fix specific ugly edges intentionally

We cannot assume a global “no edge crosses any node” rule.

If a path looks bad:

- add explicit handles
- pick left/right entry or exit points intentionally
- route that one edge more cleanly

Do not assume the renderer will magically avoid node intersections.

## Yay / Chay / Nay Logic

Use this rough decision rubric.

### Yay

Do it when:

- the node or step reflects a real runtime boundary
- it improves production debugging
- it removes ambiguity
- it makes reads/writes/enqueues clearer
- it replaces a vague edge caption with clearer node context

### Chay

Use judgment and verify in code first when:

- the boundary is real but maybe too fine-grained
- the graph is getting noisier
- a group might help, but might also hide too much
- an edge needs special routing
- a description could live either in notes or in a separate step node

When in doubt, prefer clarity rooted in runtime truth.

### Nay

Do not do it when:

- it is based on guesswork
- it only mirrors a function name
- it adds visual clutter without new operator value
- it hides an important runtime write/read/queue boundary
- it uses a group box to paper over unclear semantics

## Simplification Logic

“Simplify” does not mean “remove detail.”

It means:

- remove visual clutter
- keep real runtime boundaries
- make the section easier to scan
- make operator reasoning faster

Good simplification:

- removing technical edge captions
- moving semantics into notes
- replacing an oversized group with direct step nodes
- making the DB writer explicit instead of sharing one vague DB edge

Bad simplification:

- collapsing multiple real scheduler actions into one vague node
- hiding DB writes that matter in production
- drawing a cleaner picture that no longer matches `resq-agent`

## Workflow For Updating A Section

When asked to clean up a flow section:

1. Verify the real behavior in `resq-agent`.
2. Identify primary nodes vs step nodes.
3. Remove unnecessary edge captions.
4. Add notes where context is needed.
5. Prefer top-in / bottom-out edges.
6. Use side handles only where they genuinely improve the path.
7. Remove gray grouping boxes unless they are clearly helping.
8. Re-check whether the graph still tells the runtime truth.

## Cron Section Lessons

What worked well in the mail cron cleanup:

- restoring scheduler fidelity instead of over-collapsing it
- separating:
  - `Schedule Incoming Checks`
  - `Enqueue Incoming Check`
  - `Write Schedule Cursor`
- making the DB write belong to the node that truly writes
- adding notes to explain queue contents and worker behavior
- removing technical edge captions once node notes were good enough
- using direct step nodes instead of the old gray scheduler group

## Short Version

If you are editing a graph section:

- verify in `resq-agent` first
- keep primary nodes sparse
- use step nodes for real operational boundaries
- avoid gray groups by default
- prefer notes over edge captions
- add notes to DB nodes
- default to top-in / bottom-out edges
- use side handles only on purpose
- never simplify past the point of runtime truth
