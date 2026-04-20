import type { FlowConfig } from '../core/types';

export const APP_TITLE = 'ResQ Flow';
export const FLOWS_TITLE = `Flows | ${APP_TITLE}`;

type TitleFlow = Pick<FlowConfig, 'id' | 'name'>;

export function formatFlowTitle(flowName: string): string {
  return `${flowName} | ${APP_TITLE}`;
}

export function resolveDocumentTitle(pathname: string, registeredFlows: TitleFlow[]): string {
  if (pathname === '/') {
    return FLOWS_TITLE;
  }

  const flowMatch = pathname.match(/^\/flows\/([^/]+)$/);
  if (!flowMatch) {
    return APP_TITLE;
  }

  const flow = registeredFlows.find((entry) => entry.id === flowMatch[1]);
  return flow ? formatFlowTitle(flow.name) : APP_TITLE;
}
