import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

const fixture = (path: string): string => readFileSync(resolve(import.meta.dirname, '../fixtures', path), 'utf8');

describe('local browser fixtures', () => {
  it('covers static light and native-dark pages', () => {
    expect(fixture('static-light/index.html')).toContain('background:#fff');
    expect(fixture('static-dark/index.html')).toContain('name="color-scheme" content="dark"');
  });

  it('covers delayed changes, SPA navigation, shadow DOM, and constructed stylesheets', () => {
    const dynamic = fixture('dynamic/index.html');
    expect(dynamic).toContain('setTimeout');
    expect(dynamic).toContain('history.pushState');
    expect(dynamic).toContain('attachShadow');
    expect(dynamic).toContain('adoptedStyleSheets');
  });

  it('covers CSS, images, frames, cross-origin and failure routes', () => {
    const resources = fixture('resources/index.html');
    expect(resources).toContain('127.0.0.1:4174');
    expect(resources).toContain('<iframe');
    expect(resources).toContain('<img');
    expect(resources).toContain('/failed.css');
    expect(resources).toContain('/oversized.css');
  });
});
