export type ZoomLevel = 'far' | 'medium' | 'close';

export function resolveZoomLevel(zoom: number): ZoomLevel {
  // zoom === 0 is the uninitialized React Flow default; treat as full detail
  if (zoom <= 0) return 'close';
  if (zoom < 0.6) return 'far';
  if (zoom < 0.85) return 'medium';
  return 'close';
}
