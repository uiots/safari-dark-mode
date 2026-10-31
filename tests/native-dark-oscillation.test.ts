import {beforeEach, describe, expect, it, vi} from 'vitest';
import {decidePolicy} from '../src/shared/policy';
import {validateSettings} from '../src/shared/settings';
import {
  detectNativeDark,
  detectPageOwnedNativeDark,
  observeThemeChanges,
} from '../src/content/detector';
import {createDebouncedTask} from '../src/shared/debounce';

beforeEach(() => {
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-darkreader-mode');
  document.documentElement.removeAttribute('data-darkreader-scheme');
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
  Object.defineProperty(document, 'elementFromPoint', {configurable: true, value: undefined});
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn()})),
  });
});

describe('native dark detection with Dark Reader artifacts', () => {
  it('does not treat Dark Reader inline styles as native dark while the page is light', () => {
    document.documentElement.setAttribute('data-darkreader-mode', 'dynamic');
    document.documentElement.setAttribute('data-darkreader-scheme', 'dimmed');
    document.head.innerHTML = '<style class="darkreader darkreader--sync">html{color-scheme:dark!important}</style>';
    document.body.innerHTML = [
      '<main style="--darkreader-inline-bgcolor:#111;--darkreader-inline-color:#eee;background-color:rgb(17,17,17);color:rgb(238,238,238)">',
      'Register',
      '</main>',
    ].join('');
    document.documentElement.style.cssText = 'color-scheme:dark;background-color:rgb(17,17,17);color:rgb(238,238,238)';
    document.body.style.cssText = 'background-color:rgb(255,255,255);color:rgb(0,0,0)';

    expect(detectNativeDark(document)).toBe(false);
    expect(detectPageOwnedNativeDark(document)).toBe(false);
  });

  it('still respects page-owned dark theme signals while Dark Reader is active', () => {
    document.documentElement.setAttribute('data-darkreader-mode', 'dynamic');
    document.documentElement.classList.add('dark-theme');
    expect(detectPageOwnedNativeDark(document)).toBe(true);
    expect(detectNativeDark(document)).toBe(true);
  });

  it('does not oscillate auto policy when only Dark Reader color sampling would flip native dark', () => {
    const settings = validateSettings({enabled: true});
    document.documentElement.setAttribute('data-darkreader-mode', 'dynamic');
    document.body.innerHTML = '<main style="background-color:rgb(12,14,16);color:rgb(240,240,240)">Dark sample</main>';

    const nativeDark = detectPageOwnedNativeDark(document);
    const decision = decidePolicy(settings, 'example.com', nativeDark);

    expect(nativeDark).toBe(false);
    expect(decision.apply).toBe(true);
    expect(decision.status).toBe('darkened');
  });
});

describe('theme observer ignores Dark Reader style writes', () => {
  it('ignores style attribute mutations from Dark Reader inline variables', async () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const task = createDebouncedTask(callback, 180);
    document.body.innerHTML = '<main id="target">Form</main>';
    const target = document.getElementById('target');
    expect(target).not.toBeNull();
    const observer = observeThemeChanges(document, task.schedule);
    target?.setAttribute('style', '--darkreader-inline-color: rgb(238, 238, 238); color: rgb(238, 238, 238);');
    target?.setAttribute('data-darkreader-inline-color', '');
    await vi.advanceTimersByTimeAsync(200);
    expect(callback).not.toHaveBeenCalled();
    document.documentElement.classList.add('dark-theme');
    await vi.advanceTimersByTimeAsync(200);
    expect(callback).toHaveBeenCalledOnce();
    observer.disconnect();
    vi.useRealTimers();
  });
});
