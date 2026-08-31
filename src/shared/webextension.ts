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
