import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sparkline } from '../Sparkline';

describe('Sparkline', () => {
  it('renders a normalized polyline', () => {
    render(<Sparkline data={[4, 8, 6, 12]} />);

    const polyline = screen.getByTestId('sparkline-polyline');
    expect(polyline).toBeInTheDocument();
    expect(polyline.getAttribute('points')).toContain(',');
    expect(polyline).toHaveAttribute('stroke', 'var(--accent-primary)');
  });

  it('uses the error token for error sparklines', () => {
    render(<Sparkline data={[0, 1, 2]} variant="error" />);

    expect(screen.getByTestId('sparkline-polyline')).toHaveAttribute(
      'stroke',
      'var(--status-error)',
    );
  });
});
