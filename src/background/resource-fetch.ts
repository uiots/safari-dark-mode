import type {ResourceFetchFailure, ResourceFetchResult} from '../shared/contracts';

export const MAX_RESOURCE_BYTES = 8 * 1024 * 1024;
export const RESOURCE_TIMEOUT_MILLISECONDS = 10_000;

export interface ResourceFetcherDependencies {
  readonly fetchImplementation: typeof fetch;
  readonly timeoutMilliseconds: number;
  readonly maxBytes: number;
}

const DEFAULT_DEPENDENCIES: ResourceFetcherDependencies = {
  fetchImplementation: fetch.bind(globalThis),
  timeoutMilliseconds: RESOURCE_TIMEOUT_MILLISECONDS,
  maxBytes: MAX_RESOURCE_BYTES,
};

function failure(code: ResourceFetchFailure['code'], message: string): ResourceFetchFailure {
  return {ok: false, code, message};
}

export function validateHttpUrl(rawUrl: string): URL | undefined {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function fetchResource(
  rawUrl: string,
  dependencies: ResourceFetcherDependencies = DEFAULT_DEPENDENCIES,
): Promise<ResourceFetchResult> {
  const url = validateHttpUrl(rawUrl);
  if (url === undefined) {
    return failure('invalid-url', 'Only HTTP(S) resource URLs are supported.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort('timeout');
  }, dependencies.timeoutMilliseconds);
  try {
    const response = await dependencies.fetchImplementation(url, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
      signal: controller.signal,
    });
    const finalUrl = validateHttpUrl(response.url);
    if (finalUrl === undefined) {
      return failure('invalid-url', 'The final response URL is not HTTP(S).');
    }
    if (!response.ok) {
      return failure('http-error', `Resource returned HTTP ${String(response.status)}.`);
    }
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > dependencies.maxBytes) {
      return failure('too-large', 'Resource exceeds the 8 MiB limit.');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > dependencies.maxBytes) {
      return failure('too-large', 'Resource exceeds the 8 MiB limit.');
    }
    return {
      ok: true,
      status: response.status,
      finalUrl: finalUrl.href,
      contentType: response.headers.get('content-type') ?? '',
      bytesBase64: encodeBase64(bytes),
    };
  } catch (error: unknown) {
    if (controller.signal.aborted) {
      return failure('timeout', 'Resource request timed out.');
    }
    const message = error instanceof Error ? error.message : 'Unknown network error';
    return failure('network-error', `Resource request failed: ${message}`);
  } finally {
    clearTimeout(timer);
  }
}
