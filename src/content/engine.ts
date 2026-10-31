import {disable, enable, setFetchMethod} from '../vendor/darkreader/darkreader.mjs';
import type {ResourceFetchResult, SettingsV1} from '../shared/contracts';
import {
  DARK_SCHEME_BACKGROUND,
  DARK_SCHEME_TEXT,
  DEFAULT_GRAYSCALE,
  ENGINE_MODE_DYNAMIC,
  LIGHT_SCHEME_BACKGROUND,
  LIGHT_SCHEME_TEXT,
} from '../shared/color-theme';
import {getDynamicThemeFix} from './upstream-config';
import {sendRuntimeMessage} from '../shared/webextension';

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function proxiedFetch(url: string): Promise<Response> {
  const result = await sendRuntimeMessage<ResourceFetchResult>({type: 'resource-fetch', url});
  if (!result.ok) {
    console.warn(`[Safari Dark Mode] ${result.code}: ${result.message}`);
    throw new Error(result.message);
  }
  return new Response(decodeBase64(result.bytesBase64), {
    status: result.status,
    headers: {'content-type': result.contentType},
  });
}

setFetchMethod(proxiedFetch);

let activeTheme = '';

export function enableEngine(settings: SettingsV1, url: string): void {
  const key = JSON.stringify([
    settings.brightness,
    settings.contrast,
    settings.sepia,
    url,
    DARK_SCHEME_BACKGROUND,
    DARK_SCHEME_TEXT,
    LIGHT_SCHEME_BACKGROUND,
    LIGHT_SCHEME_TEXT,
    DEFAULT_GRAYSCALE,
  ]);
  if (activeTheme === key) {
    return;
  }
  enable({
    mode: ENGINE_MODE_DYNAMIC,
    brightness: settings.brightness,
    contrast: settings.contrast,
    sepia: settings.sepia,
    darkSchemeBackgroundColor: DARK_SCHEME_BACKGROUND,
    darkSchemeTextColor: DARK_SCHEME_TEXT,
    lightSchemeBackgroundColor: LIGHT_SCHEME_BACKGROUND,
    lightSchemeTextColor: LIGHT_SCHEME_TEXT,
    grayscale: DEFAULT_GRAYSCALE,
  }, getDynamicThemeFix(url));
  activeTheme = key;
}

export function isEngineActive(): boolean {
  return activeTheme !== '';
}

export function disableEngine(): void {
  if (activeTheme !== '') {
    disable();
    activeTheme = '';
  }
}
