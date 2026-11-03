import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/** Recharts (ResponsiveContainer) precisa de ResizeObserver; entrega uma largura fixa para os gráficos renderizarem. */
class ResizeObserverStub {
  constructor(private readonly cb: ResizeObserverCallback) {}
  observe(target: Element): void {
    this.cb([{ target, contentRect: { width: 800, height: 280 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve(): void {}
  disconnect(): void {}
}

export function installDomStubs(): void {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 280 });
  afterEach(() => cleanup());
}
