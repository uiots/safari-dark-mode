function lastError(): Error | undefined {
  const message = chrome.runtime.lastError?.message;
  return message === undefined ? undefined : new Error(message);
}

export function sendRuntimeMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T): void => {
      const error = lastError();
      if (error === undefined) {
        resolve(response);
      } else {
        reject(error);
      }
    });
  });
}

export function sendTabMessage<T>(tabId: number, message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: T): void => {
      const error = lastError();
      if (error === undefined) {
        resolve(response);
      } else {
        reject(error);
      }
    });
  });
}

export function queryTabs(query: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(query, (tabs): void => {
      const error = lastError();
      if (error === undefined) {
        resolve(tabs);
      } else {
        reject(error);
      }
    });
  });
}

export function removeTabs(tabIds: readonly number[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ids = tabIds.filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) {
      resolve();
      return;
    }
    const finish = (): void => {
      const error = lastError();
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    };
    // Safari has rejected the array form of tabs.remove for a single id.
    const only = ids[0];
    if (ids.length === 1 && only !== undefined) {
      chrome.tabs.remove(only, finish);
      return;
    }
    chrome.tabs.remove(ids, finish);
  });
}

export function getAllWindows(): Promise<chrome.windows.Window[]> {
  return new Promise((resolve, reject) => {
    const windowsApi = chrome.windows;
    if (typeof windowsApi.getAll !== 'function') {
      resolve([]);
      return;
    }
    windowsApi.getAll({populate: true}, (windows): void => {
      const error = lastError();
      if (error === undefined) {
        resolve(windows);
      } else {
        reject(error);
      }
    });
  });
}

export function alarmExists(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const alarms = chrome.alarms;
    if (typeof alarms.get !== 'function') {
      resolve(false);
      return;
    }
    alarms.get(name, (alarm): void => {
      if (lastError() !== undefined) {
        resolve(false);
        return;
      }
      resolve(alarm !== undefined);
    });
  });
}

export function createAlarm(name: string, info: chrome.alarms.AlarmCreateInfo): Promise<void> {
  return new Promise((resolve, reject) => {
    const alarms = chrome.alarms;
    if (typeof alarms.create !== 'function') {
      resolve();
      return;
    }
    alarms.create(name, info, (): void => {
      const error = lastError();
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

export function clearAlarm(name: string): Promise<void> {
  return new Promise((resolve) => {
    const alarms = chrome.alarms;
    if (typeof alarms.clear !== 'function') {
      resolve();
      return;
    }
    alarms.clear(name, (): void => {
      resolve();
    });
  });
}

export function createTab(properties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(properties, (tab): void => {
      const error = lastError();
      if (error === undefined) {
        resolve(tab);
      } else {
        reject(error);
      }
    });
  });
}

export function storageGet(key: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (items): void => {
      const error = lastError();
      if (error === undefined) {
        resolve(items);
      } else {
        reject(error);
      }
    });
  });
}

export interface ActionBadgeDetails {
  readonly text: string;
  readonly color?: string;
}

export function setActionBadge(details: ActionBadgeDetails): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.action.setBadgeText({text: details.text}, (): void => {
      const textError = lastError();
      if (textError !== undefined) {
        reject(textError);
        return;
      }
      const color = details.color;
      if (color === undefined) {
        resolve();
        return;
      }
      chrome.action.setBadgeBackgroundColor({color}, (): void => {
        const colorError = lastError();
        if (colorError === undefined) {
          resolve();
        } else {
          reject(colorError);
        }
      });
    });
  });
}

export function storageSet(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, (): void => {
      const error = lastError();
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}
