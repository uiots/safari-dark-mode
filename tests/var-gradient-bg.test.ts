import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';

/**
 * Locks engine patches for background/background-image values that contain var(
 * still running getBgImageModifier after variable wrapping (literal gradient stops).
 */
const vendorPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/vendor/darkreader/darkreader.mjs',
);

describe('var-dependent background gradients (vendor patch)', () => {
  const vendor = readFileSync(vendorPath, 'utf8');

  it('runs getBgImageModifier after var wrapping for background properties', () => {
    expect(vendor).toContain(
      'Safari Dark Mode patch: after wrapping color/bg-img vars, still run',
    );
    const idx = vendor.indexOf(
      'Safari Dark Mode patch: after wrapping color/bg-img vars, still run',
    );
    const window = vendor.slice(idx, idx + 2500);
    expect(window).toContain('getBgImageModifier(');
    expect(window).toContain('variableReplaced');
    // surrounding getModifierForVarDependant branch
    const branchStart = vendor.lastIndexOf(
      'property === "background" ||',
      idx,
    );
    expect(branchStart).toBeGreaterThan(0);
    const branch = vendor.slice(branchStart, idx + 2500);
    expect(branch).toContain('property === "background-image"');
  });
});
