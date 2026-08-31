import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

const extensionRoot = resolve(import.meta.dirname, '../dist/extension');
const manifest = JSON.parse(readFileSync(resolve(extensionRoot, 'manifest.json'), 'utf8')) as Record<string, unknown>;

describe('built Safari manifest', () => {
  it('is a tightly scoped MV3 manifest', () => {
    expect(manifest).toMatchObject({
      manifest_version: 3,
      version: '0.1.0',
      permissions: ['storage', 'tabs'],
      host_permissions: ['http://*/*', 'https://*/*'],
      background: {service_worker: 'background.js', type: 'module'},
    });
    expect(JSON.stringify(manifest)).not.toMatch(/nativeMessaging|externally_connectable|file:\/\/|analytics/i);
  });

  it('loads at document start in all HTTP(S) frames', () => {
    expect(manifest.content_scripts).toEqual([expect.objectContaining({
      matches: ['http://*/*', 'https://*/*'],
      run_at: 'document_start',
      all_frames: true,
    })]);
  });

  it('has every referenced build asset', () => {
    const files = [
      'background.js', 'content.js', 'popup/index.html', 'popup/popup.js', 'popup/popup.css',
      'onboarding/index.html', 'onboarding/onboarding.css',
      'icons/icon-16.png', 'icons/icon-32.png', 'icons/icon-48.png', 'icons/icon-128.png',
    ];
    expect(files.filter((file) => !existsSync(resolve(extensionRoot, file)))).toEqual([]);
  });
});
