import {describe, expect, it} from 'vitest';
import {isRuntimeRequest} from '../src/shared/contracts';

describe('popup/background/content contracts', () => {
  it.each([
    {type: 'get-settings'},
    {type: 'replace-settings', settings: {}},
    {type: 'get-page-state', tabId: 1},
    {type: 'report-page-state', state: {hostname: 'example.com', status: 'darkened'}},
    {type: 'resource-fetch', url: 'https://example.com/style.css'},
  ])('recognizes $type requests', (message) => {
    expect(isRuntimeRequest(message)).toBe(true);
  });

  it('rejects unrelated messages', () => {
    expect(isRuntimeRequest(null)).toBe(false);
    expect(isRuntimeRequest({type: 'external-command'})).toBe(false);
  });
});
