import {execFile} from 'node:child_process';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
import {describe, expect, it} from 'vitest';

const exec = promisify(execFile);

describe('Safari bundle stamp', () => {
  it('writes the extension version over the packager default of 1.0', async () => {
    const {stdout} = await exec(process.execPath, [resolve(import.meta.dirname, '../scripts/stamp-safari-bundle.mjs'), '--self-test']);
    expect(stdout).toContain('101');
    expect(stdout).toContain('<string>0.1.1</string>');
    expect(stdout).toContain('<key>CFBundleVersion</key>\n\t<string>101</string>');
    expect(stdout).not.toContain('<string>1.0</string>');
  });
});
