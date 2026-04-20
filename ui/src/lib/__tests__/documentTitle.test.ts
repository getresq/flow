import { describe, expect, it } from 'vitest';

import { APP_TITLE, FLOWS_TITLE, formatFlowTitle, resolveDocumentTitle } from '../documentTitle';

const flows = [
  { id: 'mail-pipeline', name: 'Mail Pipeline' },
  { id: 'other-flow', name: 'Other Flow' },
];

describe('documentTitle', () => {
  it('formats a flow title as page first, product second', () => {
    expect(formatFlowTitle('Mail Pipeline')).toBe('Mail Pipeline | ResQ Flow');
  });

  it('uses the flows landing title on the home route', () => {
    expect(resolveDocumentTitle('/', flows)).toBe(FLOWS_TITLE);
  });

  it('uses the registered flow name on flow routes', () => {
    expect(resolveDocumentTitle('/flows/mail-pipeline', flows)).toBe('Mail Pipeline | ResQ Flow');
    expect(resolveDocumentTitle('/flows/other-flow', flows)).toBe('Other Flow | ResQ Flow');
  });

  it('falls back to the product title for unknown routes', () => {
    expect(resolveDocumentTitle('/flows/missing-flow', flows)).toBe(APP_TITLE);
    expect(resolveDocumentTitle('/settings', flows)).toBe(APP_TITLE);
  });
});
