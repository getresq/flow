import mailPipelineContractJson from '../flow-contracts/mail-pipeline.json'
import type { FlowConfig, FlowContract, SpanMapping } from '../core/types'

const mailPipelineContract = mailPipelineContractJson as FlowContract

export const spanMapping: SpanMapping = {
  'rrq:queue:mail-backfill': 'batchfill-queue',
  'rrq:queue:mail-incoming': 'incoming-queue',
  'rrq:queue:mail-analyze': 'analyze-queue',
  'rrq:queue:mail-extract': 'extract-queue',
  'rrq:queue:mail-send': 'send-queue',

  'incoming.write_threads': 'write-threads',
  'incoming.write_metadata': 'write-metadata',
  'incoming.cursor_update': 'write-cursor',
  'analyze.decision': 'analyze-decision',
  'analyze.draft_insert': 'draft-reply',
  'analyze.autosend_enqueue': 'send-queue',
  'extract.upsert_contacts': 'upsert-contacts',
  'send.precheck': 'send-validate',
  'send.provider_call': 'send-process',
  'send.finalize': 'send-process',

  handle_mail_backfill_start: 'batchfill-worker',
  handle_mail_backfill_chunk: 'batchfill-worker',
  handle_mail_incoming_check: 'incoming-worker',
  handle_mail_analyze_reply: 'analyze-worker',
  handle_mail_extract: 'extract-worker',
  handle_mail_send_reply: 'send-worker',
  handle_mail_cron_tick: 'cron-scheduler',

  mail_backfill: 'batchfill-worker',
  mail_incoming: 'incoming-worker',
  mail_analyze: 'analyze-worker',
  mail_extract: 'extract-worker',
  mail_send: 'send-worker',

  threads_written: 'write-threads',
  metadata_written: 'write-metadata',
  cursor_updated: 'check-process',
}

export const producerMapping: SpanMapping = {
  handle_mail_backfill_start: 'trigger-oauth',
}

export const mailPipelineFlow: FlowConfig = {
  id: mailPipelineContract.id,
  name: mailPipelineContract.name,
  description: 'Real-time view of enqueue, worker, and persistence steps for mail processing.',
  contract: mailPipelineContract,
  hasGraph: true,
  nodes: [
    // ── Row 1: Trigger + Batchfill queue ────────────────────────────────

    {
      id: 'trigger-oauth',
      type: 'pill',
      label: 'vendor email account connected',
      sublabel: '(triggered by Fullstack → integrations → oauth flow)',
      style: { color: 'green' },
      position: { x: -274.85107880692823, y: -41.66977916206746 },
    },
    {
      id: 'batchfill-queue',
      type: 'roundedRect',
      label: 'rrq:queue:mail-backfill',
      sublabel: '(read batches of email)',
      style: { color: 'yellow', icon: 'queue' },
      position: { x: 102.17427794727337, y: -70.17862409484596 },
      size: { width: 340 },
    },

    // ── Row 2: Batchfill worker ─────────────────────────────────────────

    {
      id: 'batchfill-worker',
      type: 'rectangle',
      label: 'mail_backfill',
      sublabel: 'workers',
      style: { color: 'blue', icon: 'worker' },
      position: { x: 171.254113903571, y: 55.16426056351003 },
      bullets: [
        '1 worker at a time',
        '(configurable to n workers)',
      ],
      size: { width: 200 },
    },

    // ── Row 3: Cron scheduler ───────────────────────────────────────────

    {
      id: 'cron-scheduler',
      type: 'roundedRect',
      label: 'rpq cron (scheduler)',
      sublabel: 'function: handle_mail_cron_tick',
      style: { color: 'gray', icon: 'cron' },
      position: { x: 171.3593578111408, y: 222.04832566249775 },
      size: { width: 240 },
    },
    {
      id: 'cron-enqueue',
      type: 'badge',
      label: 'enqueue handle_mail_cron_tick (every 1 minute)',
      style: { color: 'orange' },
      position: { x: 150, y: 330 },
      size: { width: 280 },
      handles: [
        { position: 'top', type: 'target' },
        { position: 'bottom', type: 'source' },
      ],
    },

    // ── Row 4: Incoming queue ───────────────────────────────────────────

    {
      id: 'incoming-queue',
      type: 'roundedRect',
      label: 'rrq:queue:mail-incoming',
      style: { color: 'yellow', icon: 'queue' },
      position: { x: 143.3859630591553, y: 398.70018351532474 },
      size: { width: 300 },
      handles: [
        { id: 'in-top', position: 'top', type: 'target' },
        { id: 'in-left', position: 'left', type: 'target' },
        { id: 'out-bottom', position: 'bottom', type: 'source' },
      ],
    },

    // ── Row 5: Incoming worker ──────────────────────────────────────────

    {
      id: 'incoming-worker',
      type: 'rectangle',
      label: 'mail_incoming',
      sublabel: 'workers',
      style: { color: 'blue', icon: 'worker' },
      position: { x: 192.73605481681756, y: 512.6229081923432 },
      bullets: [
        '1 worker at a time',
        '(configurable to n workers)',
      ],
      size: { width: 200 },
      handles: [
        { position: 'top', type: 'target' },
        { position: 'bottom', type: 'source' },
        { id: 'out-left', position: 'left', type: 'source' },
        { id: 'out-right', position: 'right', type: 'source' },
      ],
    },

    // ── Row 6 LEFT: handle_mail_cron_tick branch ────────────────────────

    {
      id: 'incoming-cron-check-group',
      type: 'group',
      label: '',
      style: { color: 'gray' },
      position: { x: -414.09713824837337, y: 644.7445543837079 },
      size: { width: 450, height: 300 },
    },
    {
      id: 'check-process',
      type: 'rectangle',
      label: '',
      style: { color: 'gray' },
      position: { x: 205.79410083743392, y: 31.41507836880669 },
      parentId: 'incoming-cron-check-group',
      bullets: [
        'find accounts to check',
        'query mail_match_tickets',
        'lookup mail_cursors',
      ],
      size: { width: 220 },
      handles: [
        { id: 'in-top', position: 'top', type: 'target' },
        { id: 'out-left', position: 'left', type: 'source' },
        { id: 'out-right', position: 'right', type: 'source' },
        { id: 'out-bottom', position: 'bottom', type: 'source' },
      ],
    },
    {
      id: 'postgres-main',
      type: 'cylinder',
      label: 'Postgres',
      style: { color: 'blue' },
      position: { x: 228.46601515467518, y: 665.6682910322621 },
      handles: [
        { id: 'in-left', position: 'left', type: 'target' },
        { id: 'in-right', position: 'right', type: 'target' },
      ],
    },
    {
      id: 'incoming-check-enqueue',
      type: 'badge',
      label: 'enqueue handle_mail_incoming',
      style: { color: 'orange' },
      position: { x: 31.76733904125723, y: 152.75856058999545 },
      parentId: 'incoming-cron-check-group',
      size: { width: 285 },
      handles: [
        { id: 'in-top', position: 'top', type: 'target' },
        { id: 'out-left', position: 'left', type: 'source' },
      ],
    },
    {
      id: 'write-cursor',
      type: 'rectangle',
      label: 'write mail_cursors.incoming_check_scheduled_at = now',
      style: { color: 'gray' },
      position: { x: 118.2756817699867, y: 212.2844602212483 },
      parentId: 'incoming-cron-check-group',
      size: { width: 310 },
    },

    // ── Row 6 RIGHT: handle_mail_incoming_check branch ──────────────────

    {
      id: 'incoming-check-write-group',
      type: 'group',
      label: '',
      style: { color: 'gray' },
      position: { x: 488.12137433404246, y: 625.3880449696076 },
      size: { width: 310, height: 180 },
      handles: [
        { id: 'in-top', position: 'top', type: 'target' },
        { id: 'out-bottom', position: 'bottom', type: 'source' },
      ],
    },
    {
      id: 'write-threads',
      type: 'roundedRect',
      label: 'write new mail threads to s3',
      style: { color: 'blue' },
      position: { x: 42.115061315109756, y: 26.318588947174135 },
      size: { width: 230 },
      parentId: 'incoming-check-write-group',
      handles: [
        { id: 'in-top', position: 'top', type: 'target' },
        { id: 'out-right', position: 'right', type: 'source' },
        { id: 'out-bottom', position: 'bottom', type: 'source' },
      ],
    },
    {
      id: 'write-metadata',
      type: 'roundedRect',
      label: 'write mail threads metadata',
      style: { color: 'blue' },
      position: { x: 43.694708551903204, y: 91.57964723679356 },
      size: { width: 230 },
      parentId: 'incoming-check-write-group',
      handles: [
        { id: 'in-top', position: 'top', type: 'target' },
        { id: 'out-left', position: 'left', type: 'source' },
      ],
    },
    {
      id: 's3',
      type: 'cylinder',
      label: 'S3',
      style: { color: 'blue', icon: 's3' },
      position: { x: 912.0002078610469, y: 628.0348675606017 },
    },

    // ── Row 7: Enqueue badges + update-history ──────────────────────────

    {
      id: 'incoming-check-output-group',
      type: 'group',
      label: '',
      style: { color: 'gray' },
      position: { x: 438.8970533660819, y: 915.244967633114 },
      size: { width: 330, height: 220 },
      handles: [{ id: 'in-top', position: 'top', type: 'target' }],
    },
    {
      id: 'extract-enqueue',
      type: 'badge',
      label: 'enqueue handle_mail_extract',
      style: { color: 'orange' },
      position: { x: 54.79061267731481, y: 28.749628003758176 },
      size: { width: 215 },
      parentId: 'incoming-check-output-group',
      handles: [
        { id: 'in-top', position: 'top', type: 'target' },
        { id: 'out-right', position: 'right', type: 'source' },
      ],
    },
    {
      id: 'analyze-enqueue',
      type: 'badge',
      label: 'enqueue handle_and_analyze_reply',
      style: { color: 'orange' },
      position: { x: 34.374814001879145, y: 71.72142949126601 },
      size: { width: 240 },
      parentId: 'incoming-check-output-group',
      handles: [
        { id: 'in-top', position: 'top', type: 'target' },
        { id: 'out-right', position: 'right', type: 'source' },
      ],
    },
    {
      id: 'update-history',
      type: 'rectangle',
      label: 'update incoming_history_id in mail_cursors',
      style: { color: 'gray' },
      position: { x: 30, y: 120 },
      size: { width: 260 },
      parentId: 'incoming-check-output-group',
      handles: [
        { id: 'in-top', position: 'top', type: 'target' },
      ],
    },

    // ── Row 8: Analyze column ───────────────────────────────────────────

    {
      id: 'analyze-queue',
      type: 'roundedRect',
      label: 'rrq:queue:mail-analyze',
      style: { color: 'yellow', icon: 'queue' },
      position: { x: 933.7984548802381, y: 966.7359229604243 },
      size: { width: 250 },
      handles: [
        { id: 'in-left', position: 'left', type: 'target' },
        { id: 'out-bottom', position: 'bottom', type: 'source' },
      ],
    },
    {
      id: 'analyze-worker',
      type: 'rectangle',
      label: 'mail_analyze',
      sublabel: 'workers',
      style: { color: 'blue', icon: 'worker' },
      position: { x: 963.1450525290588, y: 1115.760213834821 },
      bullets: [
        '1 worker at a time',
        '(configurable to n workers)',
      ],
      size: { width: 200 },
    },
    {
      id: 'analyze-decision',
      type: 'diamond',
      label: 'AI Analyzes Thread',
      style: { color: 'orange', borderStyle: 'dashed' },
      position: { x: 1009.1817985102805, y: 1305.0009865959103 },
    },
    {
      id: 'skip-node',
      type: 'rectangle',
      label: 'skip',
      style: { color: 'gray' },
      position: { x: 1254.6272907435061, y: 1343.9197312302101 },
      size: { width: 100 },
    },
    {
      id: 'draft-reply',
      type: 'rectangle',
      label: 'Insert reply draft into\nmail_reply_drafts',
      sublabel: '(status=needs_review)',
      style: { color: 'orange' },
      position: { x: 951.002014148771, y: 1525.35781484204 },
      size: { width: 240 },
    },
    {
      id: 'autosend-decision',
      type: 'diamond',
      label: 'Autosend?',
      style: { color: 'orange' },
      position: { x: 1002.8460195177495, y: 1708.4367282160995 },
    },
    {
      id: 'stop-review',
      type: 'octagon',
      label: 'STOP await human review',
      style: { color: 'red' },
      position: { x: 1301.9525961329919, y: 1715.850456047492 },
      handles: [
        { id: 'in-left', position: 'left', type: 'target' },
      ],
    },
    {
      id: 'set-sending',
      type: 'rectangle',
      label: "- set mail_threads.reply_status = 'sending'\n- enqueue SendReplyJob",
      style: { color: 'blue' },
      position: { x: 936.5434706737374, y: 1969.1931003261295 },
      size: { width: 260 },
    },

    // ── Row 8: Extract column ───────────────────────────────────────────

    {
      id: 'extract-queue',
      type: 'roundedRect',
      label: 'rrq:queue:mail-extract',
      style: { color: 'yellow', icon: 'queue' },
      position: { x: 1536.2267320729027, y: 884.5575615891191 },
      size: { width: 250 },
      handles: [
        { id: 'in-left', position: 'left', type: 'target' },
        { id: 'out-bottom', position: 'bottom', type: 'source' },
      ],
    },
    {
      id: 'extract-worker',
      type: 'rectangle',
      label: 'mail_extract',
      sublabel: 'workers',
      style: { color: 'blue', icon: 'worker' },
      position: { x: 1557.4186496433008, y: 1021.8100973815312 },
      bullets: [
        '1 worker at a time',
        '(configurable to n workers)',
      ],
      size: { width: 200 },
    },
    {
      id: 'run-extract',
      type: 'rectangle',
      label: 'run_extract()',
      style: { color: 'orange', borderStyle: 'dashed' },
      position: { x: 1563.225396234807, y: 1202.5002881261516 },
      bullets: [
        'fetch thread from S3',
        'AI extraction via xAI',
      ],
      size: { width: 200 },
    },
    {
      id: 'extract-success',
      type: 'diamond',
      label: 'success?',
      style: { color: 'orange' },
      position: { x: 1601.4738649028704, y: 1395.3561246494808 },
    },
    {
      id: 'extract-fail-1',
      type: 'rectangle',
      label: '- record_extract_state\n- return Err (retry)',
      style: { color: 'gray' },
      position: { x: 1903.4318584145578, y: 1435.7896233091533 },
      size: { width: 200 },
    },
    {
      id: 'upsert-contacts',
      type: 'badge',
      label: 'upsert_contact(s) to mail_extracted_contacts',
      style: { color: 'green' },
      position: { x: 1529.4462572730856, y: 1595.770239096253 },
      size: { width: 290 },
      handles: [
        { id: 'in-top', position: 'top', type: 'target' },
        { id: 'out-bottom', position: 'bottom', type: 'source' },
        { id: 'out-right', position: 'right', type: 'source' },
      ],
    },
    {
      id: 'postgres-extract',
      type: 'cylinder',
      label: 'postgres',
      style: { color: 'blue' },
      position: { x: 1964.6057777240476, y: 1563.604593317544 },
      handles: [
        { id: 'in-left', position: 'left', type: 'target' },
      ],
    },
    {
      id: 'extract-success-2',
      type: 'diamond',
      label: 'success?',
      style: { color: 'orange' },
      position: { x: 1613.6395106815792, y: 1688.073923023886 },
    },
    {
      id: 'extract-fail-2',
      type: 'rectangle',
      label: '- record_extract_state\n- return Err (retry)',
      style: { color: 'gray' },
      position: { x: 1852.7491598604267, y: 1755.3000688684056 },
      size: { width: 200 },
    },
    {
      id: 'extract-record-success',
      type: 'rectangle',
      label: '- record_extract_state\n- save customer count',
      style: { color: 'gray' },
      position: { x: 1567.418649643301, y: 1904.8469366578606 },
      size: { width: 210 },
    },

    // ── Row 9: Send pipeline ────────────────────────────────────────────

    {
      id: 'send-queue',
      type: 'roundedRect',
      label: 'rrq:queue:mail-send',
      style: { color: 'yellow', icon: 'queue' },
      position: { x: 936.5434706737374, y: 2139.1931003261293 },
      size: { width: 250 },
      handles: [
        { id: 'in-top', position: 'top', type: 'target' },
        { id: 'in-right', position: 'right', type: 'target' },
        { id: 'out-bottom', position: 'bottom', type: 'source' },
      ],
    },
    {
      id: 'send-worker',
      type: 'rectangle',
      label: 'mail_send',
      sublabel: 'workers',
      style: { color: 'blue', icon: 'worker' },
      position: { x: 954.4426210590667, y: 2293.8150062832656 },
      bullets: [
        '1 worker at a time',
        '(configurable to n workers)',
      ],
      size: { width: 200 },
    },
    {
      id: 'send-process',
      type: 'rectangle',
      label: 'handle_mail_send_reply',
      style: { color: 'blue' },
      position: { x: 950.3249631752841, y: 2481.336062625731 },
      size: { width: 200 },
    },
    {
      id: 'send-validate',
      type: 'rectangle',
      label: 'Validates: idempotency → freshness →\nscope → recipient → token\nGmail API send',
      style: { color: 'blue' },
      position: { x: 900.3249631752841, y: 2589.031247024652 },
      size: { width: 290 },
    },
    {
      id: 'sent-stale',
      type: 'badge',
      label: 'sent/send_failed/stale',
      style: { color: 'blue' },
      position: { x: 860.0776982468523, y: 2728.174660683143 },
      size: { width: 170 },
    },
    {
      id: 'retry-node',
      type: 'badge',
      label: 'retry',
      style: { color: 'orange' },
      position: { x: 1146.5524469094416, y: 2726.1647700860053 },
      size: { width: 80 },
      handles: [
        { id: 'in-left', position: 'left', type: 'target' },
        { id: 'out-top', position: 'top', type: 'source' },
      ],
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
      targetHandle: 'check-process-in-top',
      label: 'execute handle_mail_cron_tick',
    },
    {
      id: 'e-check-pg',
      source: 'check-process',
      sourceHandle: 'check-process-out-right',
      target: 'postgres-main',
      targetHandle: 'postgres-main-in-left',
    },
    {
      id: 'e-check-enqueue',
      source: 'check-process',
      sourceHandle: 'check-process-out-left',
      target: 'incoming-check-enqueue',
      targetHandle: 'incoming-check-enqueue-in-top',
    },
    {
      id: 'e-check-write-cursor',
      source: 'check-process',
      sourceHandle: 'check-process-out-bottom',
      target: 'write-cursor',
    },
    {
      id: 'e-enqueue-incoming-queue',
      source: 'incoming-check-enqueue',
      sourceHandle: 'incoming-check-enqueue-out-left',
      target: 'incoming-queue',
      targetHandle: 'incoming-queue-in-left',
    },

    // ── Right branch: execute handle_mail_incoming_check ─────────────────
    {
      id: 'e-incoming-worker-write',
      source: 'incoming-worker',
      sourceHandle: 'incoming-worker-out-right',
      target: 'incoming-check-write-group',
      targetHandle: 'incoming-check-write-group-in-top',
      label: 'execute handle_mail_incoming_check',
    },
    {
      id: 'e-write-metadata',
      source: 'write-threads',
      sourceHandle: 'write-threads-out-bottom',
      target: 'write-metadata',
      targetHandle: 'write-metadata-in-top',
    },
    {
      id: 'e-write-s3',
      source: 'write-threads',
      sourceHandle: 'write-threads-out-right',
      target: 's3',
    },
    {
      id: 'e-write-metadata-postgres',
      source: 'write-metadata',
      sourceHandle: 'write-metadata-out-left',
      target: 'postgres-main',
      targetHandle: 'postgres-main-in-right',
    },
    {
      id: 'e-write-group-output',
      source: 'incoming-check-write-group',
      sourceHandle: 'incoming-check-write-group-out-bottom',
      target: 'incoming-check-output-group',
      targetHandle: 'incoming-check-output-group-in-top',
    },

    // ── Enqueue → queues ────────────────────────────────────────────────
    {
      id: 'e-analyze-enqueue-q',
      source: 'analyze-enqueue',
      sourceHandle: 'analyze-enqueue-out-right',
      target: 'analyze-queue',
      targetHandle: 'analyze-queue-in-left',
    },
    {
      id: 'e-extract-enqueue-q',
      source: 'extract-enqueue',
      sourceHandle: 'extract-enqueue-out-right',
      target: 'extract-queue',
      targetHandle: 'extract-queue-in-left',
    },

    // ── Analyze pipeline ────────────────────────────────────────────────
    {
      id: 'e-analyze-q-worker',
      source: 'analyze-queue',
      sourceHandle: 'analyze-queue-out-bottom',
      target: 'analyze-worker',
    },
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
      targetHandle: 'stop-review-in-left',
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
    {
      id: 'e-set-sending-queue',
      source: 'set-sending',
      target: 'send-queue',
      targetHandle: 'send-queue-in-top',
    },

    // ── Extract pipeline ────────────────────────────────────────────────
    {
      id: 'e-extract-q-worker',
      source: 'extract-queue',
      sourceHandle: 'extract-queue-out-bottom',
      target: 'extract-worker',
    },
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
      targetHandle: 'upsert-contacts-in-top',
      label: 'Yes',
    },
    {
      id: 'e-upsert-pg',
      source: 'upsert-contacts',
      sourceHandle: 'upsert-contacts-out-right',
      target: 'postgres-extract',
      targetHandle: 'postgres-extract-in-left',
    },
    {
      id: 'e-upsert-success2',
      source: 'upsert-contacts',
      sourceHandle: 'upsert-contacts-out-bottom',
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
    { id: 'e-send-q-worker', source: 'send-queue', sourceHandle: 'send-queue-out-bottom', target: 'send-worker' },
    { id: 'e-send-worker-process', source: 'send-worker', target: 'send-process' },
    { id: 'e-send-process-validate', source: 'send-process', target: 'send-validate' },
    { id: 'e-send-validate-outcome', source: 'send-validate', target: 'sent-stale' },
    {
      id: 'e-send-validate-retry',
      source: 'send-validate',
      target: 'retry-node',
      targetHandle: 'retry-node-in-left',
    },
    {
      id: 'e-retry-send-q',
      source: 'retry-node',
      sourceHandle: 'retry-node-out-top',
      target: 'send-queue',
      targetHandle: 'send-queue-in-right',
      label: 'status = needs_review',
    },
  ],
  producerMapping,
  spanMapping,
}
