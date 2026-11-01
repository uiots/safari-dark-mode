const DARK_ATTRIBUTE_VALUES = new Set(['dark', 'night', 'black']);
const THEME_ATTRIBUTES = ['data-theme', 'data-color-mode', 'data-bs-theme', 'theme', 'color-mode'];

export interface DetectorHint {
  readonly target: string;
  readonly match: readonly string[];
  readonly noDarkTheme: boolean;
  readonly systemTheme: boolean;
}

function extensionThemingActive(documentValue: Document): boolean {
  return documentValue.documentElement.hasAttribute('data-darkreader-mode');
}

function styleMutationIsExtensionOwned(element: Element, attributeName: string | null): boolean {
  if (attributeName === null) {
    return false;
  }
  if (attributeName.startsWith('data-darkreader')) {
    return true;
  }
  if (attributeName !== 'style') {
    return false;
  }
  const style = element.getAttribute('style') ?? '';
  return style.includes('--darkreader') || style.includes('darkreader');
}

function explicitDarkSignal(documentValue: Document): boolean {
  const meta = documentValue.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  const content = meta?.content.toLowerCase().trim() ?? '';
  if (content === 'dark' || (content.includes('dark') && matchMedia('(prefers-color-scheme: dark)').matches)) {
    return true;
  }
  for (const element of [documentValue.documentElement, documentValue.body]) {
    if ([...element.classList].some((name) => /^(dark|dark-mode|dark-theme|theme-dark|night)$/.test(name.toLowerCase()))) {
      return true;
    }
    for (const attribute of THEME_ATTRIBUTES) {
      const value = element.getAttribute(attribute)?.toLowerCase().trim();
      if (value !== undefined && DARK_ATTRIBUTE_VALUES.has(value)) {
        return true;
      }
    }
  }
  const rootStyle = getComputedStyle(documentValue.documentElement);
  const preloadActive = documentValue.querySelector('[data-safari-dark-mode="preload"]') !== null;
  const extensionTheming = extensionThemingActive(documentValue);
  return (!preloadActive && !extensionTheming && rootStyle.colorScheme === 'dark')
    || (!extensionTheming && rootStyle.filter.includes('invert(1)'));
}

function hintMatches(documentValue: Document, hint: DetectorHint): boolean | undefined {
  if (hint.noDarkTheme) {
    return false;
  }
  if (hint.systemTheme && matchMedia('(prefers-color-scheme: dark)').matches) {
    return true;
  }
  const target = documentValue.querySelector(hint.target);
  return target !== null && hint.match.some((selector) => target.matches(selector)) ? true : undefined;
}

function withExtensionStylesDisabled<T>(documentValue: Document, task: () => T): T {
  const elements = documentValue.querySelectorAll<HTMLStyleElement | HTMLLinkElement>(
    'style[class*="darkreader"], link[class*="darkreader"], style[data-safari-dark-mode]',
  );
  const elementSheets = Array.from(elements)
    .map((element) => element.sheet)
    .filter((sheet): sheet is CSSStyleSheet => sheet !== null);
  const adoptedStyleSheets = (documentValue as {adoptedStyleSheets?: CSSStyleSheet[]})
    .adoptedStyleSheets;
  const adoptedSheets = Array.from(adoptedStyleSheets ?? []).filter((sheet) => {
    try {
      const rule = sheet.cssRules.item(0);
      return rule instanceof CSSStyleRule && rule.selectorText.startsWith('#__darkreader');
    } catch {
      return false;
    }
  });
  const sheets = [...new Set([...elementSheets, ...adoptedSheets])];
  const states = sheets.map((sheet) => sheet.disabled);
  sheets.forEach((sheet) => { sheet.disabled = true; });
  try {
    return task();
  } finally {
    sheets.forEach((sheet, index) => { sheet.disabled = states[index] ?? false; });
  }
}

export function detectNativeDark(documentValue: Document, hint?: DetectorHint): boolean {
  if (hint !== undefined) {
    const result = hintMatches(documentValue, hint);
    if (result !== undefined) {
      return result;
    }
  }
  return withExtensionStylesDisabled(documentValue, () => explicitDarkSignal(documentValue));
}

/** Same explicit-signal check used before and after the engine is on. */
export function detectPageOwnedNativeDark(documentValue: Document, hint?: DetectorHint): boolean {
  return detectNativeDark(documentValue, hint);
}

export function observeThemeChanges(documentValue: Document, callback: () => void): MutationObserver {
  const isExtensionOwned = (node: Node): boolean => {
    const element = node instanceof Element ? node : node.parentElement;
    return (element?.closest('[data-safari-dark-mode], .darkreader, [class^="darkreader--"]') ?? null) !== null;
  };
  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => {
      if (isExtensionOwned(mutation.target)) {
        return false;
      }
      if (mutation.type === 'attributes') {
        if (mutation.attributeName?.startsWith('data-darkreader') === true) {
          return false;
        }
        const target = mutation.target;
        if (target instanceof Element && styleMutationIsExtensionOwned(target, mutation.attributeName)) {
          return false;
        }
        return true;
      }
      return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => !isExtensionOwned(node));
    });
    if (relevant) {
      callback();
    }
  });
  observer.observe(documentValue.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', ...THEME_ATTRIBUTES, 'content'],
  });
  return observer;
}
