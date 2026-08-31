export interface DebouncedTask {
  readonly schedule: () => void;
  readonly cancel: () => void;
}

export function createDebouncedTask(task: () => void, delayMilliseconds: number): DebouncedTask {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule: (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = undefined;
        task();
      }, delayMilliseconds);
    },
    cancel: (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}
