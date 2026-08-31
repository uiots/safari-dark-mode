import {describe, expect, it, vi} from 'vitest';
import {fetchResource, validateHttpUrl} from '../src/background/resource-fetch';

function response(body: BodyInit, url = 'https://cdn.example/style.css', status = 200, headers?: HeadersInit): Response {
  const init: ResponseInit = headers === undefined ? {status} : {status, headers};
  const value = new Response(body, init);
  Object.defineProperty(value, 'url', {value: url});
  return value;
}

describe('resource fetch proxy', () => {
  it('accepts only HTTP(S)', () => {
    expect(validateHttpUrl('https://example.com/a.css')?.protocol).toBe('https:');
    expect(validateHttpUrl('file:///tmp/a.css')).toBeUndefined();
    expect(validateHttpUrl('data:text/css,a{}')).toBeUndefined();
  });

  it('uses credential-free GET, no referrer, redirect follow, and returns encoded bytes', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init).toMatchObject({method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow'});
      return response('body{}', 'https://redirected.example/style.css', 200, {'content-type': 'text/css'});
    });
    const result = await fetchResource('https://example.com/style.css', {fetchImplementation, timeoutMilliseconds: 100, maxBytes: 100});
    expect(result).toMatchObject({ok: true, finalUrl: 'https://redirected.example/style.css', contentType: 'text/css'});
  });

  it('rejects non-HTTP final redirects and HTTP errors', async () => {
    const finalScheme = await fetchResource('https://example.com/a', {fetchImplementation: async () => response('x', 'file:///tmp/x'), timeoutMilliseconds: 100, maxBytes: 100});
    expect(finalScheme).toMatchObject({ok: false, code: 'invalid-url'});
    const httpError = await fetchResource('https://example.com/a', {fetchImplementation: async () => response('x', 'https://example.com/a', 404), timeoutMilliseconds: 100, maxBytes: 100});
    expect(httpError).toMatchObject({ok: false, code: 'http-error'});
  });

  it('enforces declared and actual size limits', async () => {
    const declared = await fetchResource('https://example.com/a', {fetchImplementation: async () => response('', undefined, 200, {'content-length': '101'}), timeoutMilliseconds: 100, maxBytes: 100});
    expect(declared).toMatchObject({ok: false, code: 'too-large'});
    const actual = await fetchResource('https://example.com/a', {fetchImplementation: async () => response('x'.repeat(101)), timeoutMilliseconds: 100, maxBytes: 100});
    expect(actual).toMatchObject({ok: false, code: 'too-large'});
  });

  it('returns typed timeout and network failures', async () => {
    const timeout = await fetchResource('https://example.com/a', {
      fetchImplementation: async (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      }),
      timeoutMilliseconds: 1,
      maxBytes: 100,
    });
    expect(timeout).toMatchObject({ok: false, code: 'timeout'});
    const network = await fetchResource('https://example.com/a', {fetchImplementation: async () => { throw new TypeError('offline'); }, timeoutMilliseconds: 100, maxBytes: 100});
    expect(network).toMatchObject({ok: false, code: 'network-error'});
  });
});
