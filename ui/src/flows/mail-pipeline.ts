import type { FlowConfig, SpanMapping } from '../core/types'

export const spanMapping: SpanMapping = {
  'rrq:queue:mail-backfill': 'batchfill-queue',
  'rrq:queue:mail-incoming': 'incoming-queue',
  'rrq:queue:mail-analyze': 'analyze-queue',
  'rrq:queue:mail-extract': 'extract-queue',
  'rrq:queue:mail-send': 'send-queue',

  handle_mail_backfill_start: 'batchfill-worker',
  handle_mail_backfill_chunk: 'batchfill-worker',
  handle_mail_incoming_check: 'incoming-worker',
  handle_mail_analyze_reply: 'analyze-worker',
  handle_mail_extract: 'extract-worker',
  handle_mail_send_reply: 'send-worker',
  handle_mail_cron_tick: 'cron-scheduler',

  mail_batchfill: 'batchfill-worker',
  mail_incoming: 'incoming-worker',
  mail_analyze: 'analyze-worker',
  mail_extract: 'extract-worker',
  mail_send: 'send-worker',

  threads_written: 'write-threads',
  metadata_written: 'postgres-main',
  cursor_updated: 'check-process',
}

export const mailPipelineFlow: FlowConfig = {
  id: 'mail-pipeline',
  name: 'Mail Pipeline',
  description: 'Real-time view of enqueue, worker, and persistence steps for mail processing.',
  nodes: [
    // ── Boundary labels ────────────────────────────────────────────────

    {
      id: 'fullstack-label',
      type: 'annotation',
      label: 'FULLSTACK',
      position: { x: 10, y: 10 },
      size: { width: 120, height: 20 },
    },
    {
      id: 'resq-agent-label',
      type: 'annotation',
      label: 'RESQ-AGENT',
      position: { x: 280, y: 10 },
      size: { width: 140, height: 20 },
    },

    // ── Row 1: Trigger + Batchfill queue ────────────────────────────────

    {
      id: 'trigger-oauth',
      type: 'pill',
      label: 'vendor email account connected',
      sublabel: '(triggered by Fullstack → integrations → oauth flow)',
      style: { color: 'green' },
      position: { x: 10, y: 55 },
    },
    {
      id: 'batchfill-queue',
      type: 'roundedRect',
      label: 'rrq:queue:mail-batchfill',
      sublabel: '(read batches of email)',
      style: { color: 'yellow', icon: 'queue' },
      position: { x: 300, y: 30 },
      size: { width: 340, height: 65 },
    },

    // ── Row 2: Batchfill worker ─────────────────────────────────────────

    {
      id: 'batchfill-worker',
      type: 'rectangle',
      label: 'mail_batchfill',
      sublabel: 'workers',
      style: { color: 'blue', icon: 'worker' },
      position: { x: 340, y: 120 },
      bullets: [
        '1 worker at a time',
        '(configurable to n workers)',
      ],
      size: { width: 200, height: 100 },
    },
    {
      id: 'batchfill-annotation',
      type: 'annotation',
      label: '- uses mail_cursors.batchfill_page_token to control paging\n- config/start from first page\n- tokenResponse from that page\n- done when/skip fetchResponse (already completed)',
      position: { x: 560, y: 85 },
      size: { width: 300, height: 100 },
    },

    // ── Row 3: Cron scheduler ───────────────────────────────────────────

    {
      id: 'cron-scheduler',
      type: 'roundedRect',
      label: 'rpq cron (scheduler)',
      sublabel: 'function: handle_mail_cron_tick',
      style: { color: 'gray', icon: 'cron' },
      position: { x: 160, y: 240 },
      size: { width: 240, height: 70 },
    },
    {
      id: 'cron-enqueue',
      type: 'badge',
      label: 'enqueue handle_mail_cron_tick (every 1 minute)',
      style: { color: 'orange' },
      position: { x: 150, y: 330 },
      size: { width: 280, height: 32 },
      handles: [
        { position: 'top', type: 'target' },
        { position: 'bottom', type: 'source' },
      ],
    },

    // ── TERMS annotation ────────────────────────────────────────────────

    {
      id: 'terms-annotation',
      type: 'annotation',
      label: 'TERMS\n\n■ mail thread = gmail conversation\n  1. One vendor email with no replies can be 1 mail thread.\n  2. Vendor + customer back-and-forth (many emails) is still 1 mail thread.\n  3. Vendor emailing two different people in separate conversations is usually 2 mail threads.\n  4. Vendor emailing multiple people on one same conversation (reply-all chain) is usually 1 mail thread.\n\n▶ cursor (incoming_history_id) is a mailbox change marker',
      position: { x: 700, y: 180 },
      size: { width: 380, height: 200 },
    },

    // ── Row 4: Incoming queue ───────────────────────────────────────────

    {
      id: 'incoming-queue',
      type: 'roundedRect',
      label: 'rrq:queue:mail-incoming',
      style: { color: 'yellow', icon: 'queue' },
      position: { x: 300, y: 380 },
      size: { width: 300, height: 55 },
    },

    // ── Row 5: Incoming worker ──────────────────────────────────────────

    {
      id: 'incoming-worker',
      type: 'rectangle',
      label: 'mail_incoming',
      sublabel: 'workers',
      style: { color: 'blue', icon: 'worker' },
      position: { x: 340, y: 460 },
      bullets: [
        '1 worker at a time',
        '(configurable to n workers)',
      ],
      size: { width: 200, height: 100 },
      handles: [
        { position: 'top', type: 'target' },
        { position: 'bottom', type: 'source' },
        { id: 'out-left', position: 'left', type: 'source' },
        { id: 'out-right', position: 'right', type: 'source' },
      ],
    },
    {
      id: 'incoming-worker-annotation',
      type: 'annotation',
      label: 'contains both job types:\n  - handle_mail_cron_tick\n  - handle_mail_incoming_check\n  - goes one by flow multiple vendors/mailboxes',
      position: { x: 560, y: 445 },
      size: { width: 260, height: 80 },
    },

    // ── Row 6 LEFT: handle_mail_cron_tick branch ────────────────────────

    {
      id: 'check-process',
      type: 'rectangle',
      label: '',
      style: { color: 'gray' },
      position: { x: 50, y: 600 },
      bullets: [
        'find accounts to check',
        'query mail_match_tickets',
        'lookup mail_cursors',
      ],
      size: { width: 220, height: 95 },
    },
    {
      id: 'postgres-main',
      type: 'circle',
      label: 'Postgres',
      style: { color: 'blue', icon: 'postgres' },
      position: { x: 310, y: 630 },
    },
    {
      id: 'incoming-check-enqueue',
      type: 'badge',
      label: 'enqueue handle_mail_incoming_check (thread mail)',
      style: { color: 'orange' },
      position: { x: 30, y: 720 },
      size: { width: 285, height: 35 },
    },
    {
      id: 'write-cursor',
      type: 'rectangle',
      label: 'write mail_cursors.incoming_check_scheduled_at = now',
      style: { color: 'gray' },
      position: { x: 30, y: 775 },
      size: { width: 310, height: 45 },
    },

    // ── Row 6 RIGHT: handle_mail_incoming_check branch ──────────────────

    {
      id: 'write-threads',
      type: 'roundedRect',
      label: 'write new mail threads to s3',
      sublabel: '- write mail threads metadata',
      style: { color: 'blue' },
      position: { x: 500, y: 600 },
      size: { width: 230, height: 70 },
    },
    {
      id: 's3',
      type: 'circle',
      label: 'S3',
      style: { color: 'blue', icon: 's3' },
      position: { x: 770, y: 570 },
    },
    {
      id: 'job-annotation',
      type: 'annotation',
      label: '1 job corresponds to 1 mailbox\n1 mailbox can have 1..n mail threads\non initial pass, only same cursor',
      position: { x: 770, y: 620 },
      size: { width: 250, height: 60 },
    },

    // ── Row 7: Enqueue badges + update-history ──────────────────────────

    {
      id: 'extract-enqueue',
      type: 'badge',
      label: 'enqueue handle_mail_extract',
      style: { color: 'orange' },
      position: { x: 480, y: 710 },
      size: { width: 215, height: 32 },
    },
    {
      id: 'analyze-enqueue',
      type: 'badge',
      label: 'enqueue handle_and_analyze_reply',
      style: { color: 'orange' },
      position: { x: 480, y: 760 },
      size: { width: 240, height: 32 },
    },
    {
      id: 'update-history',
      type: 'rectangle',
      label: 'update incoming_history_id in mail_cursors',
      style: { color: 'gray' },
      position: { x: 480, y: 810 },
      size: { width: 260, height: 40 },
    },

    // ── Finished annotations ────────────────────────────────────────────

    {
      id: 'cron-finished-annotation',
      type: 'annotation',
      label: 'handle_mail_cron_tick is finished when:\n- find accounts to check\n- count mail_match tickets\n- enqueue handle_mail_incoming_check is done for the selected accounts\n- write mail_cursors.incoming_check_scheduled_at = now is done for those same accounts',
      position: { x: 30, y: 840 },
      size: { width: 310, height: 100 },
    },
    {
      id: 'incoming-finished-annotation',
      type: 'annotation',
      label: 'handle_mail_incoming_check is finished when one of these completes:\n- backmatch path (Zhi run, no record, only update incoming_history_id in mail_cursors)\n- same cursor path\n  - write new mail threads to s3\n  - to then handle_mail_extract\n  - enqueue handle_mail_extract\n  - enqueue handle_mail_analyze_reply\n  - updates incoming_history_id in mail_cursors',
      position: { x: 360, y: 870 },
      size: { width: 380, height: 120 },
    },

    // ── Row 8: Analyze column ───────────────────────────────────────────

    {
      id: 'analyze-queue',
      type: 'roundedRect',
      label: 'rrq:queue:mail-analyze',
      style: { color: 'yellow', icon: 'queue' },
      position: { x: 320, y: 1020 },
      size: { width: 250, height: 55 },
    },
    {
      id: 'analyze-worker',
      type: 'rectangle',
      label: 'mail_analyze',
      sublabel: 'workers',
      style: { color: 'blue', icon: 'worker' },
      position: { x: 350, y: 1100 },
      bullets: [
        '1 worker at a time',
        '(configurable to n workers)',
      ],
      size: { width: 200, height: 100 },
    },
    {
      id: 'analyze-decision',
      type: 'diamond',
      label: 'AI Analyzes Thread',
      style: { color: 'orange', borderStyle: 'dashed' },
      position: { x: 375, y: 1230 },
    },
    {
      id: 'skip-node',
      type: 'rectangle',
      label: 'skip',
      style: { color: 'gray' },
      position: { x: 620, y: 1260 },
      size: { width: 100, height: 40 },
    },
    {
      id: 'draft-reply',
      type: 'rectangle',
      label: 'Insert reply draft into\nmail_reply_drafts',
      sublabel: '(status=needs_review)',
      style: { color: 'orange' },
      position: { x: 340, y: 1400 },
      size: { width: 240, height: 80 },
    },
    {
      id: 'autosend-decision',
      type: 'diamond',
      label: 'Autosend?',
      style: { color: 'orange' },
      position: { x: 370, y: 1520 },
    },
    {
      id: 'stop-review',
      type: 'octagon',
      label: 'STOP await human review',
      style: { color: 'red' },
      position: { x: 620, y: 1530 },
      size: { width: 210, height: 130 },
    },
    {
      id: 'set-sending',
      type: 'rectangle',
      label: "- set mail_threads.reply_status = 'sending'\n- enqueue SendReplyJob",
      style: { color: 'blue' },
      position: { x: 340, y: 1690 },
      size: { width: 260, height: 65 },
    },

    // ── Row 8: Extract column ───────────────────────────────────────────

    {
      id: 'extract-queue',
      type: 'roundedRect',
      label: 'rrq:queue:mail-extract',
      style: { color: 'yellow', icon: 'queue' },
      position: { x: 870, y: 1020 },
      size: { width: 250, height: 55 },
    },
    {
      id: 'extract-annotation',
      type: 'annotation',
      label: '*need xai key\nfor extract job execution',
      position: { x: 1140, y: 1020 },
      size: { width: 150, height: 40 },
    },
    {
      id: 'extract-worker',
      type: 'rectangle',
      label: 'mail_extract',
      sublabel: 'workers',
      style: { color: 'blue', icon: 'worker' },
      position: { x: 900, y: 1100 },
      bullets: [
        '1 worker at a time',
        '(configurable to n workers)',
      ],
      size: { width: 200, height: 100 },
    },
    {
      id: 'run-extract',
      type: 'rectangle',
      label: 'run_extract()',
      style: { color: 'orange', borderStyle: 'dashed' },
      position: { x: 920, y: 1230 },
      bullets: [
        'fetch thread from S3',
        'AI extraction via xAI',
      ],
      size: { width: 200, height: 80 },
    },
    {
      id: 'extract-success',
      type: 'diamond',
      label: 'success?',
      style: { color: 'orange' },
      position: { x: 940, y: 1350 },
    },
    {
      id: 'extract-fail-1',
      type: 'rectangle',
      label: '- record_extract_state\n- return Err (retry)',
      style: { color: 'gray' },
      position: { x: 1160, y: 1360 },
      size: { width: 200, height: 55 },
    },
    {
      id: 'normalize-annotation',
      type: 'annotation',
      label: '- normalize emails\n- dedupe per thread\n- merge: never overwrite non-empty with empty',
      position: { x: 830, y: 1490 },
      size: { width: 250, height: 55 },
    },
    {
      id: 'upsert-contacts',
      type: 'badge',
      label: 'upsert_contact(s) to mail_extracted_contacts',
      style: { color: 'green' },
      position: { x: 870, y: 1560 },
      size: { width: 290, height: 35 },
      handles: [
        { position: 'top', type: 'target' },
        { position: 'bottom', type: 'source' },
        { position: 'right', type: 'source' },
      ],
    },
    {
      id: 'postgres-extract',
      type: 'circle',
      label: 'postgres',
      style: { color: 'blue', icon: 'postgres' },
      position: { x: 1220, y: 1540 },
    },
    {
      id: 'extract-success-2',
      type: 'diamond',
      label: 'success?',
      style: { color: 'orange' },
      position: { x: 940, y: 1630 },
    },
    {
      id: 'extract-fail-2',
      type: 'rectangle',
      label: '- record_extract_state\n- return Err (retry)',
      style: { color: 'gray' },
      position: { x: 1160, y: 1640 },
      size: { width: 200, height: 55 },
    },
    {
      id: 'extract-record-success',
      type: 'rectangle',
      label: '- record_extract_state\n- save customer count',
      style: { color: 'gray' },
      position: { x: 910, y: 1790 },
      size: { width: 210, height: 55 },
    },

    // ── Row 9: Send pipeline ────────────────────────────────────────────

    {
      id: 'send-queue',
      type: 'roundedRect',
      label: 'rrq:queue:mail-send',
      style: { color: 'yellow', icon: 'queue' },
      position: { x: 340, y: 1850 },
      size: { width: 250, height: 55 },
    },
    {
      id: 'send-worker',
      type: 'rectangle',
      label: 'mail_send',
      sublabel: 'workers',
      style: { color: 'blue', icon: 'worker' },
      position: { x: 370, y: 1930 },
      bullets: [
        '1 worker at a time',
        '(configurable to n workers)',
      ],
      size: { width: 200, height: 100 },
    },
    {
      id: 'send-process',
      type: 'rectangle',
      label: 'handle_mail_send_reply',
      style: { color: 'blue' },
      position: { x: 380, y: 2055 },
      size: { width: 200, height: 40 },
    },
    {
      id: 'send-validate',
      type: 'rectangle',
      label: 'Validates: idempotency → freshness →\nscope → recipient → token\nGmail API send',
      style: { color: 'blue' },
      position: { x: 330, y: 2120 },
      size: { width: 290, height: 85 },
    },
    {
      id: 'sent-stale',
      type: 'badge',
      label: 'sent/send_failed/stale',
      style: { color: 'blue' },
      position: { x: 340, y: 2230 },
      size: { width: 170, height: 32 },
    },
    {
      id: 'retry-node',
      type: 'badge',
      label: 'retry',
      style: { color: 'orange' },
      position: { x: 530, y: 2230 },
      size: { width: 80, height: 32 },
    },
  ],

  edges: [
    // ── Trigger → Batchfill ─────────────────────────────────────────────
    { id: 'e-trigger-batchfill', source: 'trigger-oauth', target: 'batchfill-queue', type: 'dashed' },
    { id: 'e-batchfill-q-worker', source: 'batchfill-queue', target: 'batchfill-worker' },

    // ── Cron → Incoming ─────────────────────────────────────────────────
    { id: 'e-cron-enqueue', source: 'cron-scheduler', target: 'cron-enqueue' },
    { id: 'e-cron-enqueue-incoming', source: 'cron-enqueue', target: 'incoming-queue' },

    // ── Incoming queue → worker ─────────────────────────────────────────
    { id: 'e-incoming-q-worker', source: 'incoming-queue', target: 'incoming-worker' },

    // ── Left branch: execute handle_mail_cron_tick ───────────────────────
    {
      id: 'e-incoming-worker-check',
      source: 'incoming-worker',
      sourceHandle: 'incoming-worker-out-left',
      target: 'check-process',
      label: 'execute handle_mail_cron_tick',
    },
    { id: 'e-check-pg', source: 'check-process', target: 'postgres-main' },
    { id: 'e-check-enqueue', source: 'check-process', target: 'incoming-check-enqueue' },
    { id: 'e-enqueue-cursor', source: 'incoming-check-enqueue', target: 'write-cursor' },

    // ── Right branch: execute handle_mail_incoming_check ─────────────────
    {
      id: 'e-incoming-worker-write',
      source: 'incoming-worker',
      sourceHandle: 'incoming-worker-out-right',
      target: 'write-threads',
      label: 'execute handle_mail_incoming_check',
    },
    { id: 'e-write-s3', source: 'write-threads', target: 's3' },
    { id: 'e-write-extract-enqueue', source: 'write-threads', target: 'extract-enqueue' },
    { id: 'e-write-analyze-enqueue', source: 'write-threads', target: 'analyze-enqueue' },
    { id: 'e-write-update-history', source: 'write-threads', target: 'update-history' },

    // ── Enqueue → queues ────────────────────────────────────────────────
    { id: 'e-analyze-enqueue-q', source: 'analyze-enqueue', target: 'analyze-queue' },
    { id: 'e-extract-enqueue-q', source: 'extract-enqueue', target: 'extract-queue' },

    // ── Analyze pipeline ────────────────────────────────────────────────
    { id: 'e-analyze-q-worker', source: 'analyze-queue', target: 'analyze-worker' },
    {
      id: 'e-analyze-worker-decision',
      source: 'analyze-worker',
      target: 'analyze-decision',
      targetHandle: 'analyze-decision-in-top',
    },
    {
      id: 'e-analyze-skip',
      source: 'analyze-decision',
      sourceHandle: 'analyze-decision-out-right',
      target: 'skip-node',
      label: 'action = skip',
      type: 'dashed',
    },
    {
      id: 'e-analyze-draft',
      source: 'analyze-decision',
      sourceHandle: 'analyze-decision-out-bottom',
      target: 'draft-reply',
      label: 'action = draft_reply',
    },
    {
      id: 'e-draft-autosend',
      source: 'draft-reply',
      target: 'autosend-decision',
      targetHandle: 'autosend-decision-in-top',
    },
    {
      id: 'e-autosend-stop',
      source: 'autosend-decision',
      sourceHandle: 'autosend-decision-out-right',
      target: 'stop-review',
      label: 'No',
      type: 'dashed',
    },
    {
      id: 'e-autosend-send',
      source: 'autosend-decision',
      sourceHandle: 'autosend-decision-out-bottom',
      target: 'set-sending',
      label: 'Yes',
    },
    { id: 'e-set-sending-queue', source: 'set-sending', target: 'send-queue' },

    // ── Extract pipeline ────────────────────────────────────────────────
    { id: 'e-extract-q-worker', source: 'extract-queue', target: 'extract-worker' },
    { id: 'e-extract-worker-run', source: 'extract-worker', target: 'run-extract' },
    {
      id: 'e-run-extract-success',
      source: 'run-extract',
      target: 'extract-success',
      targetHandle: 'extract-success-in-top',
    },
    {
      id: 'e-extract-fail-1',
      source: 'extract-success',
      sourceHandle: 'extract-success-out-right',
      target: 'extract-fail-1',
      label: 'No',
      type: 'dashed',
    },
    {
      id: 'e-extract-success-upsert',
      source: 'extract-success',
      sourceHandle: 'extract-success-out-bottom',
      target: 'upsert-contacts',
      label: 'Yes',
    },
    { id: 'e-upsert-pg', source: 'upsert-contacts', target: 'postgres-extract' },
    {
      id: 'e-upsert-success2',
      source: 'upsert-contacts',
      target: 'extract-success-2',
      targetHandle: 'extract-success-2-in-top',
    },
    {
      id: 'e-extract-fail-2',
      source: 'extract-success-2',
      sourceHandle: 'extract-success-2-out-right',
      target: 'extract-fail-2',
      label: 'No',
      type: 'dashed',
    },
    {
      id: 'e-extract-success-record',
      source: 'extract-success-2',
      sourceHandle: 'extract-success-2-out-bottom',
      target: 'extract-record-success',
      label: 'Yes',
    },
    {
      id: 'e-extract-next-job',
      source: 'extract-record-success',
      target: 'extract-queue',
      label: 'Get next job',
      type: 'dashed',
    },

    // ── Send pipeline ───────────────────────────────────────────────────
    {
      id: 'e-stop-review-send-q',
      source: 'stop-review',
      target: 'send-queue',
      label: 'status = needs_review',
      type: 'dashed',
    },
    { id: 'e-send-q-worker', source: 'send-queue', target: 'send-worker' },
    { id: 'e-send-worker-process', source: 'send-worker', target: 'send-process' },
    { id: 'e-send-process-validate', source: 'send-process', target: 'send-validate' },
    { id: 'e-send-validate-outcome', source: 'send-validate', target: 'sent-stale' },
    {
      id: 'e-send-validate-retry',
      source: 'send-validate',
      target: 'retry-node',
    },
  ],

  spanMapping,
}
