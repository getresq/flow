import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveMappedNodeId } from '../core/mapping'
import type { FlowEvent } from '../core/types'
import { flows } from '../flows'

const replayFlow = flows.find((flow) => flow.id === 'mail-pipeline') ?? flows[0]

function parseSpeedArg(defaultSpeed = 1): number {
  const speedFlagIndex = process.argv.findIndex((arg) => arg === '--speed')
  if (speedFlagIndex === -1) {
    return defaultSpeed
  }

  const value = process.argv[speedFlagIndex + 1]
  if (!value) {
    return defaultSpeed
  }

  const normalized = value.endsWith('x') ? value.slice(0, -1) : value
  const parsed = Number.parseFloat(normalized)

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultSpeed
  }

  return parsed
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function loadReplayFixture(): Promise<FlowEvent[]> {
  const fixturePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), './fixtures/mail-pipeline-replay.json')
  const content = await readFile(fixturePath, 'utf8')
  const events = JSON.parse(content) as FlowEvent[]
  return [...events].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
}

export async function runDirectReplay(events: FlowEvent[], speed = 1) {
  const hitCounter = new Map<string, number>()

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]
    const next = events[index + 1]
    const mappedNodeId = resolveMappedNodeId(event, replayFlow.spanMapping)

    if (mappedNodeId) {
      hitCounter.set(mappedNodeId, (hitCounter.get(mappedNodeId) ?? 0) + 1)
    }

    const stamp = new Date(event.timestamp).toLocaleTimeString()
    const label = mappedNodeId ?? 'unmapped'
    // eslint-disable-next-line no-console
    console.log(`[direct replay] ${stamp} | ${event.type} -> ${label} | ${event.message ?? event.span_name ?? 'event'}`)

    if (!next) {
      continue
    }

    const wait = Math.max(Date.parse(next.timestamp) - Date.parse(event.timestamp), 0) / speed
    if (wait > 0) {
      await delay(wait)
    }
  }

  // eslint-disable-next-line no-console
  console.log('[direct replay] top node hits:')
  for (const [nodeId, count] of [...hitCounter.entries()].sort((left, right) => right[1] - left[1]).slice(0, 10)) {
    // eslint-disable-next-line no-console
    console.log(`  ${nodeId}: ${count}`)
  }
}

async function main() {
  const speed = parseSpeedArg(1)
  const events = await loadReplayFixture()
  await runDirectReplay(events, speed)
}

if (import.meta.main) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[direct replay] failed', error)
    process.exit(1)
  })
}
