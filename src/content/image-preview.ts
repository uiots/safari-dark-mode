export const IMAGE_PREVIEW_HOST_ID = 'safari-dark-mode-image-preview';
export const IMAGE_PREVIEW_DELAY_MS = 250;

const MIN_PREVIEW_PIXELS = 48;
const ORIGINAL_ATTRIBUTES = [
  'data-zoom-src',
  'data-zoom-image',
  'data-zoom',
  'data-full-src',
  'data-full-url',
  'data-full',
  'data-original',
  'data-original-src',
  'data-orig-file',
  'data-hires',
  'data-hi-res',
  'data-highres',
  'data-high-res',
  'data-large-src',
  'data-large',
  'data-src-large',
] as const;
const LAZY_ATTRIBUTES = ['data-src', 'data-lazy-src', 'data-lazy', 'data-url', 'data-image'] as const;
const SRCSET_ATTRIBUTES = ['srcset', 'data-srcset', 'data-lazy-srcset'] as const;
const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|jxl|png|svg|webp)(?:$|[?#])/i;
const URL_VALUE = /^(?:[a-z][a-z\d+.-]*:|\/\/|\/|\.\.?\/)/i;
const WIDTH_DESCRIPTOR = /^(\d+)w$/;
const DENSITY_DESCRIPTOR = /^(\d+(?:\.\d+)?)x$/;

interface SrcCandidate {
  readonly url: string;
  readonly width: number | null;
  readonly density: number | null;
}

interface ResolvedCandidate {
  readonly url: string;
  readonly width: number | null;
  readonly density: number;
}

const installed = new WeakSet<Document>();

function isWhitespace(character: string): boolean {
  return character === ' ' || character === '\n' || character === '\t' || character === '\r' || character === '\f';
}

function looksLikeUrlValue(value: string): boolean {
  return URL_VALUE.test(value) || value.includes('/') || IMAGE_EXTENSION.test(value);
}

function isSupportedPreviewUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:image/');
}

function isPlaceholderUrl(url: string): boolean {
  return url === '' || (url.startsWith('data:') && url.length < 256);
}

function resolveUrl(value: string, base: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '' || /^(?:javascript|about):/i.test(trimmed) || !looksLikeUrlValue(trimmed)) {
    return null;
  }
  try {
    const url = new URL(trimmed, base).href;
    return isSupportedPreviewUrl(url) ? url : null;
  } catch {
    return null;
  }
}

function looksLikeImageUrl(url: string): boolean {
  if (url.startsWith('data:image/') || url.startsWith('blob:')) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return IMAGE_EXTENSION.test(parsed.pathname)
      || /[?&](?:format|fm|ext|type)=(avif|gif|jpe?g|jxl|png|svg|webp)\b/i.test(parsed.search);
  } catch {
    return false;
  }
}

function parseSrcset(value: string): readonly SrcCandidate[] {
  const candidates: SrcCandidate[] = [];
  let index = 0;
  while (index < value.length) {
    while (index < value.length && (isWhitespace(value[index] ?? '') || value[index] === ',')) {
      index += 1;
    }
    if (index >= value.length) {
      break;
    }
    let url = '';
    const quote = value[index];
    if (quote === '"' || quote === "'") {
      const end = value.indexOf(quote, index + 1);
      if (end === -1) {
        break;
      }
      url = value.slice(index + 1, end);
      index = end + 1;
    } else {
      const start = index;
      const dataUrl = value.slice(index, index + 5).toLowerCase() === 'data:';
      while (index < value.length && !isWhitespace(value[index] ?? '') && (dataUrl || value[index] !== ',')) {
        index += 1;
      }
      url = value.slice(start, index);
    }
    let width: number | null = null;
    let density: number | null = null;
    while (index < value.length && value[index] !== ',') {
      while (index < value.length && isWhitespace(value[index] ?? '')) {
        index += 1;
      }
      if (index >= value.length || value[index] === ',') {
        break;
      }
      const descriptorStart = index;
      while (index < value.length && !isWhitespace(value[index] ?? '') && value[index] !== ',') {
        index += 1;
      }
      const descriptor = value.slice(descriptorStart, index);
      const widthText = WIDTH_DESCRIPTOR.exec(descriptor)?.[1];
      const densityText = DENSITY_DESCRIPTOR.exec(descriptor)?.[1];
      if (widthText !== undefined) {
        width = Number(widthText);
      } else if (densityText !== undefined) {
        const parsed = Number(densityText);
        if (parsed > 0) {
          density = parsed;
        }
      }
    }
    if (url !== '') {
      candidates.push({url, width, density});
    }
  }
  return candidates;
}

function attributeUrl(img: HTMLImageElement, name: string): string | null {
  const raw = img.getAttribute(name);
  if (raw === null || raw.trim() === '') {
    return null;
  }
  if (/\s/.test(raw)) {
    return bestCandidate(parseSrcset(raw), img.baseURI)?.url ?? null;
  }
  return resolveUrl(raw, img.baseURI);
}

function firstAttributeUrl(img: HTMLImageElement, names: readonly string[]): string | null {
  for (const name of names) {
    const resolved = attributeUrl(img, name);
    if (resolved !== null) {
      return resolved;
    }
  }
  return null;
}

function bestCandidate(candidates: readonly SrcCandidate[], base: string): ResolvedCandidate | null {
  const resolved: ResolvedCandidate[] = [];
  for (const candidate of candidates) {
    const url = resolveUrl(candidate.url, base);
    if (url === null) {
      continue;
    }
    resolved.push({url, width: candidate.width, density: candidate.density ?? 1});
  }
  const widths = resolved.filter((candidate) => candidate.width !== null);
  const pool = widths.length > 0 ? widths : resolved;
  let best = pool[0];
  if (best === undefined) {
    return null;
  }
  for (const candidate of pool) {
    const bestScore = best.width ?? best.density;
    const candidateScore = candidate.width ?? candidate.density;
    if (candidateScore > bestScore) {
      best = candidate;
    }
  }
  return best;
}

function collectSrcsetCandidates(img: HTMLImageElement): readonly SrcCandidate[] {
  const values: string[] = [];
  for (const name of SRCSET_ATTRIBUTES) {
    const raw = img.getAttribute(name);
    if (raw !== null && raw.trim() !== '') {
      values.push(raw);
    }
  }
  const parent = img.parentElement;
  if (parent?.tagName === 'PICTURE') {
    for (const child of parent.children) {
      if (!(child instanceof HTMLSourceElement)) {
        continue;
      }
      for (const name of ['srcset', 'data-srcset'] as const) {
        const raw = child.getAttribute(name);
        if (raw !== null && raw.trim() !== '') {
          values.push(raw);
        }
      }
    }
  }
  return values.flatMap((value) => parseSrcset(value));
}

function loadedUrl(img: HTMLImageElement): string {
  if (img.currentSrc !== '') {
    return img.currentSrc;
  }
  const raw = img.getAttribute('src');
  if (raw === null || raw.trim() === '') {
    return '';
  }
  return resolveUrl(raw, img.baseURI) ?? '';
}

function isTinyImage(img: HTMLImageElement): boolean {
  return img.naturalWidth > 0 && img.naturalHeight > 0
    && Math.max(img.naturalWidth, img.naturalHeight) < MIN_PREVIEW_PIXELS;
}

function shouldUseSrcsetCandidate(
  candidate: ResolvedCandidate,
  img: HTMLImageElement,
  currentUsable: boolean,
): boolean {
  if (candidate.width !== null && img.naturalWidth > candidate.width && currentUsable) {
    return false;
  }
  if (candidate.width !== null) {
    return candidate.width >= MIN_PREVIEW_PIXELS;
  }
  if (candidate.density > 1 && img.naturalWidth > 0 && img.naturalHeight > 0) {
    return Math.max(img.naturalWidth, img.naturalHeight) * candidate.density >= MIN_PREVIEW_PIXELS;
  }
  if (candidate.density > 1) {
    return true;
  }
  return !isTinyImage(img);
}

function linkedOriginal(img: HTMLImageElement): string | null {
  const anchor = img.closest('a');
  if (!(anchor instanceof HTMLAnchorElement)) {
    return null;
  }
  const raw = anchor.getAttribute('href');
  if (raw === null || raw.trim() === '' || raw.startsWith('#')) {
    return null;
  }
  const resolved = resolveUrl(raw, img.baseURI);
  if (resolved === null || !looksLikeImageUrl(resolved)) {
    return null;
  }
  return resolved;
}

function addUrl(urls: string[], url: string | null): void {
  if (url !== null && !urls.includes(url)) {
    urls.push(url);
  }
}

// Prefer an explicit original URL, then a linked image file, then the largest
// srcset candidate that beats the loaded bitmap. Later entries are fallbacks
// for when an earlier URL is an HTML page or is blocked. Icons stay quiet
// unless a larger file exists.
export function selectPreviewUrls(img: HTMLImageElement): readonly string[] {
  const current = loadedUrl(img);
  const currentUsable = isSupportedPreviewUrl(current) && !isPlaceholderUrl(current);
  const urls: string[] = [];
  addUrl(urls, firstAttributeUrl(img, ORIGINAL_ATTRIBUTES));
  const linked = linkedOriginal(img);
  if (linked !== null && linked !== current) {
    addUrl(urls, linked);
  }
  const sized = bestCandidate(collectSrcsetCandidates(img), img.baseURI);
  if (sized !== null && shouldUseSrcsetCandidate(sized, img, currentUsable)) {
    addUrl(urls, sized.url);
  }
  const lazy = firstAttributeUrl(img, LAZY_ATTRIBUTES);
  if (lazy !== null && lazy !== current && (!currentUsable || isTinyImage(img))) {
    addUrl(urls, lazy);
  }
  if (!isTinyImage(img) && currentUsable) {
    addUrl(urls, current);
  }
  return urls;
}

export function selectPreviewUrl(img: HTMLImageElement): string | null {
  return selectPreviewUrls(img)[0] ?? null;
}

function declareStyle(element: HTMLElement, declarations: readonly (readonly [string, string])[]): void {
  for (const [property, value] of declarations) {
    element.style.setProperty(property, value, 'important');
  }
}

const HOST_DECLARATIONS = [
  ['position', 'fixed'],
  ['inset', '0'],
  ['z-index', '2147483647'],
  ['display', 'flex'],
  ['align-items', 'center'],
  ['justify-content', 'center'],
  ['width', '100vw'],
  ['height', '100vh'],
  ['max-width', 'none'],
  ['max-height', 'none'],
  ['margin', '0'],
  ['padding', '0'],
  ['border', '0'],
  ['background', 'transparent'],
  ['pointer-events', 'none'],
  ['visibility', 'visible'],
  ['opacity', '1'],
  ['transform', 'none'],
  ['filter', 'none'],
  ['clip-path', 'none'],
] as const;

const FRAME_DECLARATIONS = [
  ['box-sizing', 'border-box'],
  ['max-width', 'min(88vw, 1120px)'],
  ['max-height', '88vh'],
  ['padding', '8px'],
  ['border-radius', '12px'],
  ['background', 'rgba(12, 14, 16, 0.94)'],
  ['box-shadow', '0 18px 50px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.14)'],
  ['pointer-events', 'none'],
  ['overflow', 'hidden'],
] as const;

const IMAGE_DECLARATIONS = [
  ['display', 'block'],
  ['max-width', 'min(calc(88vw - 16px), 1104px)'],
  ['max-height', 'calc(88vh - 16px)'],
  ['width', 'auto'],
  ['height', 'auto'],
  ['object-fit', 'contain'],
  ['border-radius', '6px'],
  ['pointer-events', 'none'],
  ['filter', 'none'],
  ['background', 'transparent'],
] as const;

function createPreview(doc: Document, url: string, onError: () => void): HTMLElement {
  const host = doc.createElement('div');
  host.id = IMAGE_PREVIEW_HOST_ID;
  host.dataset.safariDarkMode = 'image-preview';
  host.dataset.previewSrc = url;
  host.setAttribute('aria-hidden', 'true');
  declareStyle(host, HOST_DECLARATIONS);
  // Closed so page CSS and Dark Reader's shadow walker cannot restyle the bitmap.
  const shadow = host.attachShadow({mode: 'closed'});
  const frame = doc.createElement('div');
  const image = doc.createElement('img');
  image.alt = '';
  image.draggable = false;
  image.decoding = 'async';
  image.loading = 'eager';
  declareStyle(frame, FRAME_DECLARATIONS);
  declareStyle(image, IMAGE_DECLARATIONS);
  // Defer so a synchronous error cannot overwrite the host just assigned by show().
  image.addEventListener('error', () => {
    queueMicrotask(onError);
  });
  image.src = url;
  frame.append(image);
  shadow.append(frame);
  return host;
}

export function installImagePreview(doc: Document = document): () => void {
  if (installed.has(doc)) {
    return () => undefined;
  }
  installed.add(doc);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hovered: HTMLImageElement | undefined;
  let host: HTMLElement | undefined;
  let generation = 0;

  const cancelTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  const removeHost = (): void => {
    host?.remove();
    host = undefined;
  };
  const dismiss = (): void => {
    cancelTimer();
    hovered = undefined;
    generation += 1;
    removeHost();
  };
  const show = (img: HTMLImageElement): void => {
    const urls = selectPreviewUrls(img);
    if (urls.length === 0) {
      return;
    }
    const currentGeneration = generation + 1;
    generation = currentGeneration;
    const present = (index: number): void => {
      if (generation !== currentGeneration) {
        return;
      }
      const url = urls[index];
      if (url === undefined) {
        removeHost();
        return;
      }
      removeHost();
      host = createPreview(doc, url, () => {
        present(index + 1);
      });
      doc.documentElement.append(host);
    };
    present(0);
  };
  const imageTarget = (event: Event): HTMLImageElement | null => {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) {
      return null;
    }
    if (target.closest(`[data-safari-dark-mode="image-preview"]`) !== null) {
      return null;
    }
    return target;
  };
  const onOver = (event: Event): void => {
    const img = imageTarget(event);
    if (img === null || img === hovered) {
      return;
    }
    hovered = img;
    cancelTimer();
    removeHost();
    timer = setTimeout(() => {
      timer = undefined;
      if (hovered === img && img.isConnected) {
        show(img);
      }
    }, IMAGE_PREVIEW_DELAY_MS);
  };
  const onOut = (event: Event): void => {
    if (!(event instanceof MouseEvent)) {
      return;
    }
    const img = imageTarget(event);
    if (img === null || img !== hovered) {
      return;
    }
    const next = event.relatedTarget;
    if (next instanceof Node && (next === img || img.contains(next))) {
      return;
    }
    dismiss();
  };
  const onKey = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || event.key !== 'Escape' || (hovered === undefined && host === undefined)) {
      return;
    }
    dismiss();
  };
  const onScroll = (): void => {
    if (hovered === undefined && host === undefined) {
      return;
    }
    dismiss();
  };

  doc.addEventListener('mouseover', onOver, true);
  doc.addEventListener('mouseout', onOut, true);
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('scroll', onScroll, true);
  return () => {
    installed.delete(doc);
    dismiss();
    doc.removeEventListener('mouseover', onOver, true);
    doc.removeEventListener('mouseout', onOut, true);
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('scroll', onScroll, true);
  };
}
