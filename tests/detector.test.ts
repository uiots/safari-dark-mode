import {beforeEach, describe, expect, it, vi} from 'vitest';
import {detectNativeDark, observeThemeChanges} from '../src/content/detector';
import {createDebouncedTask} from '../src/shared/debounce';

beforeEach(() => {
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-theme');
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
  Object.defineProperty(document, 'elementFromPoint', {configurable: true, value: undefined});
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn()})),
  });
});

describe('native-theme detector', () => {
  it('recognizes color-scheme metadata', () => {
    document.head.innerHTML = '<meta name="color-scheme" content="dark light">';
    expect(detectNativeDark(document)).toBe(true);
  });

  it.each([
    ['class', (): void => { document.documentElement.classList.add('dark-theme'); }],
    ['attribute', (): void => { document.documentElement.setAttribute('data-theme', 'DARK'); }],
  ])('recognizes a common dark %s', (_name, setup) => {
    setup();
    expect(detectNativeDark(document)).toBe(true);
  });

  it('uses matching detector hints and supports no-dark-theme hints', () => {
    document.documentElement.dataset.mode = 'night';
    expect(detectNativeDark(document, {target: 'html', match: ['[data-mode="night"]'], noDarkTheme: false, systemTheme: false})).toBe(true);
    document.documentElement.className = 'dark';
    expect(detectNativeDark(document, {target: 'html', match: [], noDarkTheme: true, systemTheme: false})).toBe(false);
  });

  it('samples dark backgrounds with light foregrounds', () => {
    document.body.innerHTML = '<main style="background-color:rgb(12, 14, 16);color:rgb(240, 240, 240)">Dark</main>';
    document.documentElement.style.cssText = 'background-color:rgb(12, 14, 16);color:rgb(240, 240, 240)';
    document.body.style.cssText = document.documentElement.style.cssText;
    expect(detectNativeDark(document)).toBe(true);
  });

  it('ignores extension-owned samples', () => {
    document.body.innerHTML = '<main data-safari-dark-mode style="background-color:rgb(0,0,0);color:rgb(255,255,255)">Owned</main>';
    document.documentElement.style.cssText = 'background-color:rgb(255,255,255);color:rgb(0,0,0)';
    expect(detectNativeDark(document)).toBe(false);
  });

  it('ignores the extension preload color scheme', () => {
    document.head.innerHTML = '<style data-safari-dark-mode="preload">:root{color-scheme:dark;background:#181a1b}</style>';
    document.documentElement.style.cssText = 'color-scheme:dark;background-color:rgb(24,26,27);color:rgb(232,230,227)';
    document.body.style.cssText = 'background-color:rgb(255,255,255);color:rgb(0,0,0)';
    expect(detectNativeDark(document)).toBe(false);
  });

  it('uses visible viewport samples instead of dark off-screen sections', () => {
    document.body.innerHTML = [
      '<article id="promo" style="background-color:rgb(0,0,0);color:rgb(255,255,255)"></article>',
      '<main id="products" style="background-color:rgb(255,255,255);color:rgb(0,0,0)"></main>',
    ].join('');
    const promo = document.getElementById('promo');
    const products = document.getElementById('products');
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn((x: number) => x < innerWidth / 2 ? promo : products),
    });
    expect(detectNativeDark(document)).toBe(false);
  });

  it('disables extension styles while sampling to prevent feedback loops', () => {
    document.head.innerHTML = '<style class="darkreader darkreader--sync">body{background:#111;color:#eee}</style>';
    const sheet = document.styleSheets[0];
    expect(sheet).toBeDefined();
    const observedDisabled: boolean[] = [];
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => {
        observedDisabled.push(sheet?.disabled ?? false);
        return document.body;
      }),
    });
    detectNativeDark(document);
    expect(observedDisabled.length).toBeGreaterThan(0);
    expect(observedDisabled.every(Boolean)).toBe(true);
    expect(sheet?.disabled).toBe(false);
  });
});

describe('dynamic reevaluation', () => {
  it('debounces relevant theme mutations', async () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const task = createDebouncedTask(callback, 180);
    const observer = observeThemeChanges(document, task.schedule);
    document.documentElement.className = 'dark';
    document.documentElement.className = 'dark-theme';
    await vi.advanceTimersByTimeAsync(179);
    expect(callback).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(callback).toHaveBeenCalledOnce();
    observer.disconnect();
    vi.useRealTimers();
  });
});
