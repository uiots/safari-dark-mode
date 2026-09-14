import {expect, it, vi} from 'vitest';

vi.mock('../src/content/upstream-config', () => ({getDetectorHint: vi.fn()}));

const enableEngine = vi.hoisted(() => vi.fn());
vi.mock('../src/content/engine', () => ({enableEngine, disableEngine: vi.fn()}));
vi.mock('../src/shared/webextension', () => ({
  sendRuntimeMessage: vi.fn(async () => ({enabled: true})),
}));

it('starts dark mode before the body exists without waiting for a refresh', async () => {
  const body = document.body;
  body.remove();
  vi.stubGlobal('chrome', {runtime: {onMessage: {addListener: vi.fn()}}});
  try {
    await import('../src/content/index');
    await vi.waitFor(() => { expect(enableEngine).toHaveBeenCalled(); });
    expect(document.getElementById('safari-dark-mode-preload')).toBeNull();
  } finally {
    document.documentElement.append(body);
    vi.unstubAllGlobals();
  }
});
