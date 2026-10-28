declare module '*.config' {
  const contents: string;
  export default contents;
}

declare module '*.mjs' {
  interface Theme {
    readonly mode?: 0 | 1;
    readonly brightness?: number;
    readonly contrast?: number;
    readonly sepia?: number;
    readonly darkSchemeBackgroundColor?: string;
    readonly darkSchemeTextColor?: string;
    readonly lightSchemeBackgroundColor?: string;
    readonly lightSchemeTextColor?: string;
    readonly grayscale?: number;
  }

  interface DynamicThemeFix {
    readonly invert: string[];
    readonly css: string;
    readonly ignoreInlineStyle: string[];
    readonly ignoreImageAnalysis: string[];
    readonly disableStyleSheetsProxy: boolean;
    readonly ignoreCSSUrl: string[];
  }

  export function enable(theme?: Theme, fixes?: DynamicThemeFix): void;
  export function disable(): void;
  export function setFetchMethod(method: (url: string) => Promise<Response>): void;
}
