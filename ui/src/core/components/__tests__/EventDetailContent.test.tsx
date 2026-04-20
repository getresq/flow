import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EventDetailContent } from '../EventDetailContent';
import type { LogEntry } from '../../types';

const baseEntry: LogEntry = {
  timestamp: '2026-03-24T16:00:00.000Z',
  level: 'info',
  nodeId: 'send-process',
  message: 'Provider call completed',
  signal: 'meaningful',
  defaultVisible: true,
  eventType: 'log',
  traceId: 'run-1',
  runId: 'run-1',
};

describe('EventDetailContent', () => {
  it('renders the log message for non-error events', () => {
    render(<EventDetailContent entry={baseEntry} hasJourney />);

    expect(screen.getByText(/Provider call completed/)).toBeInTheDocument();
  });

  it('shows the error block with error_message when present and hides the message', () => {
    render(
      <EventDetailContent
        entry={{
          ...baseEntry,
          level: 'error',
          message: 'fallback error message',
          attributes: { error_message: 'Provider timed out after 30s' },
        }}
        hasJourney
      />,
    );

    expect(screen.getByText('Provider timed out after 30s')).toBeInTheDocument();
    expect(screen.queryByText(/fallback error message/)).not.toBeInTheDocument();
  });

  it('shows the view run button when a run is available and clicks through', () => {
    const onOpenRun = vi.fn();

    render(<EventDetailContent entry={baseEntry} hasJourney onOpenRun={onOpenRun} />);

    fireEvent.click(screen.getByRole('button', { name: 'View run' }));

    expect(onOpenRun).toHaveBeenCalledWith('run-1');
  });

  it('hides the view run button when there is no run id', () => {
    render(
      <EventDetailContent
        entry={{ ...baseEntry, runId: undefined, traceId: 'trace-only' }}
        hasJourney
      />,
    );

    expect(screen.queryByRole('button', { name: 'View run' })).not.toBeInTheDocument();
  });

  it('keeps the raw telemetry section collapsed by default', () => {
    render(<EventDetailContent entry={baseEntry} hasJourney />);

    const details = screen.getByText('Raw telemetry').closest('details');
    expect(details).not.toHaveAttribute('open');
  });
});
