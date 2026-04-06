# Trace Validation Queries

Use these during Step 4/Step 8 smoke checks to verify one journey across sinks.

## VictoriaLogs

```bash
curl -sG 'http://localhost:9428/select/logsql/query' \
  --data-urlencode 'query=_time:30m event:mail_e2e_event and thread_id:<thread_id> and job_id:<job_id> and reply_draft_id:<reply_draft_id>' \
  --data-urlencode 'limit=50'
```

Expected: ordered `incoming -> analyze/extract -> send` mail events with matching IDs.

## VictoriaTraces

```bash
curl -sG 'http://localhost:10428/select/logsql/query' \
  --data-urlencode 'query=_time:30m "resource_attr:thread_id":"<thread_id>" and "resource_attr:job_id":"<job_id>" and "resource_attr:reply_draft_id":"<reply_draft_id>"' \
  --data-urlencode 'limit=50'
```

Expected: trace span rows with matching `resource_attr:*` IDs and step tags.

## resq-flow Relay Stream

```bash
bun run /tmp/step4-relay-capture.ts
THREAD_ID='<thread_id>' jq -r '.[] | select(.attributes.thread_id == env.THREAD_ID) | [.seq,.type,.event_kind,.node_key,.attributes.step_id] | @tsv' /tmp/step4-relay-events.json
```

Expected: deterministic `seq` order and matching `thread_id/job_id/reply_draft_id` across span/log events.
