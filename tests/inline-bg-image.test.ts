import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

/**
 * Locks the Safari Dark Mode engine patches that make Dynamic Theme hide
 * large light background images on ALL elements (not only html/body),
 * including SPA re-entry (async result cache + loop soft-bypass + shorthand).
 */
const vendorPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/vendor/darkreader/darkreader.mjs',
);

describe('inline background-image analysis (vendor patch)', () => {
  const vendor = readFileSync(vendorPath, 'utf8');

  it('analyzes inline background-image URLs on every element', () => {
    expect(vendor).toContain(
      'Safari Dark Mode patch: analyze ALL inline background-image URLs',
    );
    const marker =
      '(property === "background-image" || property === "background") &&';
    const idx = vendor.indexOf(marker);
    expect(idx).toBeGreaterThan(0);
    const window = vendor.slice(idx, idx + 360);
    expect(window).toContain('setCustomProp(property, property, value)');
    expect(window).toContain('value.includes("url")');
    expect(window).toContain('value.includes("gradient")');
    expect(window).not.toContain('document.documentElement');
    expect(window).not.toContain('document.body');
  });

  it('proxies image bytes through setFetchMethod for analysis', () => {
    expect(vendor).toContain(
      'Safari Dark Mode patch: always proxy image bytes',
    );
    const idx = vendor.indexOf('async function getDataURL');
    const window = vendor.slice(idx, idx + 550);
    expect(window).toContain('bgFetch');
    expect(window).toContain('responseType: "data-url"');
  });

  it('caches async bg-image overrides for sync SPA re-apply', () => {
    expect(vendor).toContain(
      'Safari Dark Mode patch: cache async bg-image results so SPA',
    );
    const idx = vendor.indexOf(
      'Safari Dark Mode patch: cache async bg-image results so SPA',
    );
    const window = vendor.slice(idx, idx + 900);
    expect(window).toContain('inlineStringValueCache');
    expect(window).toContain('.set(sourceValue, value)');
  });

  it('soft-bypasses loop detection when element still has bg url', () => {
    expect(vendor).toContain(
      'Safari Dark Mode patch: SPA/React + our own data-darkreader attr writes',
    );
    const idx = vendor.indexOf(
      'Safari Dark Mode patch: SPA/React + our own data-darkreader attr writes',
    );
    const window = vendor.slice(idx, idx + 900);
    expect(window).toContain('hasBgUrl');
    expect(window).toContain('elementsLoopCycles.delete(element)');
  });
});
