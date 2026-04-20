import type { ReactNode } from 'react';

import type { FlowConfig } from '../core/types';
import { FlowRegistryContext } from './context';

export function FlowRegistryProvider({
  flows,
  children,
}: {
  flows: FlowConfig[];
  children: ReactNode;
}) {
  return <FlowRegistryContext.Provider value={flows}>{children}</FlowRegistryContext.Provider>;
}
