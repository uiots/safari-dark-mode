import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe, expect, it} from 'vitest';

describe('Safari CSS declaration parsing', () => {
  it('does not turn custom properties into borders or outlines', () => {
    const source = readFileSync('src/vendor/darkreader/darkreader.mjs', 'utf8');
    const start = source.indexOf('const shorthandVarDependantProperties =');
    const end = source.indexOf('function handleEmptyShorthand', start);
    const declarations: string[][] = [];
    runInNewContext(source.slice(start, end) + '\niterateCSSDeclarations(style, iterate);', {
      isSafari: true,
      style: {cssText: '--card-border: var(--line); --focus-outline: var(--line); border: 1px solid var(--line);'},
      iterate: (property: string, value: string) => declarations.push([property, value]),
      forEach: () => undefined,
    });
    expect(declarations).toEqual([['border', '1px solid var(--line)']]);
  });
});
