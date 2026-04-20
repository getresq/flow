import { DEFAULT_RELAY_WS_URL } from '../core/hooks/useRelayConnection';
import type { FlowConfig, FlowContract } from '../core/types';

interface FlowDefinitionsResponse {
  flows?: FlowConfig[];
}

export async function fetchRuntimeFlows(wsUrl = DEFAULT_RELAY_WS_URL): Promise<FlowConfig[]> {
  const url = new URL('/v1/flows', resolveRelayHttpBaseUrl(wsUrl));
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`flow definitions request failed: ${response.status}`);
  }
  const payload = (await response.json()) as FlowDefinitionsResponse;
  return (payload.flows ?? []).map(normalizeFlowConfig);
}

function resolveRelayHttpBaseUrl(wsUrl: string): string {
  const normalized = new URL(wsUrl);
  normalized.protocol = normalized.protocol === 'wss:' ? 'https:' : 'http:';
  normalized.pathname = '';
  normalized.search = '';
  normalized.hash = '';
  return normalized.toString();
}

function createHeadlessFlow(contract: FlowContract): FlowConfig {
  return {
    id: contract.id,
    name: contract.name,
    contract,
    hasGraph: false,
    nodes: [],
    edges: [],
    spanMapping: {},
  };
}

function normalizeFlowConfig(flow: FlowConfig): FlowConfig {
  if (!flow.hasGraph) {
    return {
      ...createHeadlessFlow(flow.contract),
      description: flow.description,
    };
  }

  return {
    ...flow,
    nodes: flow.nodes ?? [],
    edges: flow.edges ?? [],
    spanMapping: flow.spanMapping ?? {},
    producerMapping: flow.producerMapping,
    seedPositions: flow.seedPositions,
  };
}
