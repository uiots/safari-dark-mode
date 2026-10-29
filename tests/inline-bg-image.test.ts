import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

/**
 * Locks the Safari Dark Mode engine patches that make Dynamic Theme hide
 * large light background images on ALL elements (not only html/body).
 * workbuddy.cn pricing page was the repro; the fix is generic.
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
    const marker = 'if (property === "background-image" && value.includes("url"))';
    const idx = vendor.indexOf(marker);
    expect(idx).toBeGreaterThan(0);
    const window = vendor.slice(idx, idx + 280);
    expect(window).toContain('setCustomProp(property, property, value)');
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
});
