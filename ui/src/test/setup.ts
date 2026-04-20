import { GlobalRegistrator } from '@happy-dom/global-registrator';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

GlobalRegistrator.register();

if (!globalThis.ResizeObserver) {
  class TestResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: TestResizeObserver,
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});
