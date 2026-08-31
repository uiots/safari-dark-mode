import type {SettingsV1} from '../shared/contracts';
import {DEFAULT_SETTINGS, validateSettings} from '../shared/settings';
import {storageGet, storageSet} from '../shared/webextension';

const STORAGE_KEY = 'settingsV1';

export async function readSettings(): Promise<SettingsV1> {
  const stored = await storageGet(STORAGE_KEY);
  const validated = validateSettings(stored[STORAGE_KEY]);
  if (JSON.stringify(stored[STORAGE_KEY]) !== JSON.stringify(validated)) {
    await storageSet({[STORAGE_KEY]: validated});
  }
  return validated;
}

export async function writeSettings(value: unknown): Promise<SettingsV1> {
  const settings = validateSettings(value);
  await storageSet({[STORAGE_KEY]: settings});
  return settings;
}

export async function initializeSettings(): Promise<void> {
  const stored = await storageGet(STORAGE_KEY);
  if (!(STORAGE_KEY in stored)) {
    await storageSet({[STORAGE_KEY]: DEFAULT_SETTINGS});
  } else {
    await readSettings();
  }
}
