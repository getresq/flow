import { createContext, useContext } from 'react';

import type { FlowConfig } from '../core/types';

export const FlowRegistryContext = createContext<FlowConfig[]>([]);

export function useRegisteredFlows(): FlowConfig[] {
  return useContext(FlowRegistryContext);
}
