import type {PageStatus} from '../shared/contracts';
import {expandOriginalUrls, type OriginalUrlContext} from './original-url';

export const IMAGE_PREVIEW_HOST_ID = 'safari-dark-mode-image-preview';
export const IMAGE_PREVIEW_DELAY_MS = 300;
export const PREVIEW_SCROLL_REFRESH_MS = 20;
export const PREVIEW_GAP_PX = 12;
export const PREVIEW_VIEWPORT_MARGIN_PX = 8;

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

function originalUrlContext(img: HTMLImageElement): OriginalUrlContext {
  const pageHost = img.ownerDocument.location.hostname;
  return pageHost === '' ? {} : {pageHost};
}

// Prefer an explicit original URL, then a linked image file, then the largest
// srcset candidate that beats the loaded bitmap, then the loaded bitmap.
// Each of those is upgraded through the original-url rules first, so a CDN
// rewrite is tried before the URL it came from. Later entries are fallbacks
// for when an earlier URL 404s, is an HTML page, or is blocked. Icons stay
// quiet unless a larger file or a rewrite exists.
export function selectPreviewUrls(img: HTMLImageElement): readonly string[] {
  const current = loadedUrl(img);
  const currentUsable = isSupportedPreviewUrl(current) && !isPlaceholderUrl(current);
  const urls: string[] = [];
  const context = originalUrlContext(img);
  const consider = (url: string | null, includeSelf: boolean): void => {
    if (url === null) {
      return;
    }
    for (const rewritten of expandOriginalUrls(url, context)) {
      addUrl(urls, rewritten);
    }
    if (includeSelf) {
      addUrl(urls, url);
    }
  };
  consider(firstAttributeUrl(img, ORIGINAL_ATTRIBUTES), true);
  const linked = linkedOriginal(img);
  if (linked !== null && linked !== current) {
    consider(linked, true);
  }
  const sized = bestCandidate(collectSrcsetCandidates(img), img.baseURI);
  if (sized !== null && shouldUseSrcsetCandidate(sized, img, currentUsable)) {
    consider(sized.url, true);
  }
  const lazy = firstAttributeUrl(img, LAZY_ATTRIBUTES);
  if (lazy !== null && lazy !== current && (!currentUsable || isTinyImage(img))) {
    consider(lazy, true);
  }
  if (currentUsable && !isTinyImage(img)) {
    consider(current, true);
  } else if (currentUsable) {
    consider(current, false);
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

const FRAME_CHROME_PX = 6;
const SIDES = ['right', 'left', 'bottom', 'top'] as const;
export type PreviewSide = (typeof SIDES)[number];

export interface AnchorBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface ViewportBox {
  readonly width: number;
  readonly height: number;
}

export interface PreviewPlacement {
  readonly side: PreviewSide;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (maximum < minimum) {
    return minimum;
  }
  return Math.min(maximum, Math.max(minimum, value));
}

function contain(maxWidth: number, maxHeight: number, ratio: number): {readonly width: number; readonly height: number} {
  if (maxWidth <= 0 || maxHeight <= 0 || !(ratio > 0) || !Number.isFinite(ratio)) {
    return {width: 0, height: 0};
  }
  const widthFromHeight = maxHeight * ratio;
  if (widthFromHeight <= maxWidth) {
    return {width: widthFromHeight, height: maxHeight};
  }
  return {width: maxWidth, height: maxWidth / ratio};
}

// PhotoShow-style placement: measure the open rectangle on each side of the
// thumbnail, fit the image's aspect ratio into each one (scaled up to the
// rectangle, not capped at the file's pixel size), and keep the side that
// yields the largest preview. Ties prefer right, then left, then bottom, then
// top. The box sits against the thumbnail and is clamped inside the viewport.
export function placePreview(anchor: AnchorBox, viewport: ViewportBox, aspectRatio: number): PreviewPlacement {
  const margin = PREVIEW_VIEWPORT_MARGIN_PX;
  const gap = PREVIEW_GAP_PX;
  const ratio = aspectRatio > 0 && Number.isFinite(aspectRatio) ? aspectRatio : 1.5;
  const innerWidth = Math.max(0, viewport.width - margin * 2);
  const innerHeight = Math.max(0, viewport.height - margin * 2);
  const regions: Record<PreviewSide, {readonly width: number; readonly height: number}> = {
    right: {width: viewport.width - margin - (anchor.right + gap), height: innerHeight},
    left: {width: anchor.left - gap - margin, height: innerHeight},
    bottom: {width: innerWidth, height: viewport.height - margin - (anchor.bottom + gap)},
    top: {width: innerWidth, height: anchor.top - gap - margin},
  };

  let chosenSide: PreviewSide = 'right';
  let chosenWidth = 0;
  let chosenHeight = 0;
  let chosenArea = -1;
  for (const side of SIDES) {
    const region = regions[side];
    const fitted = contain(
      Math.max(0, region.width) - FRAME_CHROME_PX * 2,
      Math.max(0, region.height) - FRAME_CHROME_PX * 2,
      ratio,
    );
    const area = fitted.width * fitted.height;
    if (area > chosenArea) {
      chosenSide = side;
      chosenArea = area;
      chosenWidth = fitted.width + FRAME_CHROME_PX * 2;
      chosenHeight = fitted.height + FRAME_CHROME_PX * 2;
    }
  }

  const width = Math.min(Math.max(0, chosenWidth), innerWidth);
  const height = Math.min(Math.max(0, chosenHeight), innerHeight);
  let left = margin;
  let top = margin;
  if (chosenSide === 'right') {
    left = anchor.right + gap;
    top = anchor.top + (anchor.height - height) / 2;
  } else if (chosenSide === 'left') {
    left = anchor.left - gap - width;
    top = anchor.top + (anchor.height - height) / 2;
  } else if (chosenSide === 'bottom') {
    top = anchor.bottom + gap;
    left = anchor.left + (anchor.width - width) / 2;
  } else {
    top = anchor.top - gap - height;
    left = anchor.left + (anchor.width - width) / 2;
  }

  return {
    side: chosenSide,
    left: clamp(left, margin, viewport.width - margin - width),
    top: clamp(top, margin, viewport.height - margin - height),
    width,
    height,
  };
}

function anchorRatio(img: HTMLImageElement): number {
  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
    return img.naturalWidth / img.naturalHeight;
  }
  const rect = img.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return rect.width / rect.height;
  }
  return 1.5;
}

function viewportBox(doc: Document): ViewportBox {
  const view = doc.defaultView;
  return {
    width: view?.innerWidth ?? doc.documentElement.clientWidth,
    height: view?.innerHeight ?? doc.documentElement.clientHeight,
  };
}

function positionPreview(host: HTMLElement, anchor: HTMLImageElement, ratio: number): void {
  if (!anchor.isConnected) {
    return;
  }
  const placement = placePreview(anchor.getBoundingClientRect(), viewportBox(host.ownerDocument), ratio);
  host.dataset.previewSide = placement.side;
  declareStyle(host, [
    ['left', `${String(placement.left)}px`],
    ['top', `${String(placement.top)}px`],
    ['width', `${String(placement.width)}px`],
    ['height', `${String(placement.height)}px`],
  ]);
}

const HOST_LAYOUT_DECLARATIONS = [
  ['position', 'fixed'],
  ['z-index', '2147483647'],
  ['margin', '0'],
  ['box-sizing', 'border-box'],
  ['pointer-events', 'none'],
  ['visibility', 'visible'],
  ['opacity', '1'],
  ['transform', 'none'],
  ['filter', 'none'],
  ['clip-path', 'none'],
  ['overflow', 'hidden'],
] as const;

// Imagus's 20px bottom margin is room for a caption. This preview has no caption,
// so the frame keeps the 3px inset, 3px border, 2px radius, and soft shadow.
const LIGHT_FRAME = {
  backgroundColor: '#f8f8ff',
  border: '3px solid hsla(0, 0%, 95%, 0.6)',
  borderRadius: '2px',
  boxShadow: '0 0 2px #666',
  padding: '3px',
} as const;

const DARK_FRAME = {
  backgroundColor: 'hsla(240, 12%, 10%, 0.94)',
  border: '3px solid hsla(0, 0%, 100%, 0.18)',
  borderRadius: '2px',
  boxShadow: '0 0 2px #000',
  padding: '3px',
} as const;

export function previewSchemeFromPageStatus(status: PageStatus): boolean | null {
  if (status === 'darkened' || status === 'forced' || status === 'native-dark') {
    return true;
  }
  if (status === 'disabled') {
    return false;
  }
  return null;
}

export function previewFrameIsDark(extensionDark: boolean | null, prefersDark: boolean): boolean {
  return extensionDark ?? prefersDark;
}

export function previewFrameDeclarations(dark: boolean): readonly (readonly [string, string])[] {
  const frame = dark ? DARK_FRAME : LIGHT_FRAME;
  return [
    ['background-color', frame.backgroundColor],
    ['background-clip', 'padding-box'],
    ['border', frame.border],
    ['border-radius', frame.borderRadius],
    ['box-shadow', frame.boxShadow],
    ['padding', frame.padding],
  ];
}

const frameRepaints = new Set<() => void>();
let extensionDark: boolean | null = null;
let prefersDark = false;
let schemeMedia: MediaQueryList | undefined;

function currentFrameIsDark(): boolean {
  return previewFrameIsDark(extensionDark, prefersDark);
}

function notifyFrameRepaints(): void {
  for (const repaint of frameRepaints) {
    repaint();
  }
}

function ensureSchemeMedia(): void {
  if (schemeMedia !== undefined || typeof matchMedia !== 'function') {
    return;
  }
  try {
    schemeMedia = matchMedia('(prefers-color-scheme: dark)');
  } catch {
    return;
  }
  prefersDark = schemeMedia.matches;
  if (typeof schemeMedia.addEventListener !== 'function') {
    return;
  }
  schemeMedia.addEventListener('change', (): void => {
    prefersDark = schemeMedia?.matches ?? false;
    if (extensionDark === null) {
      notifyFrameRepaints();
    }
  });
}

export function setImagePreviewScheme(next: boolean | null): void {
  ensureSchemeMedia();
  extensionDark = next;
  notifyFrameRepaints();
}

function applyPreviewFrame(host: HTMLElement): void {
  declareStyle(host, previewFrameDeclarations(currentFrameIsDark()));
}

const FRAME_DECLARATIONS = [
  ['box-sizing', 'border-box'],
  ['width', '100%'],
  ['height', '100%'],
  ['margin', '0'],
  ['padding', '0'],
  ['border', '0'],
  ['background', 'transparent'],
  ['pointer-events', 'none'],
  ['overflow', 'hidden'],
] as const;

const IMAGE_DECLARATIONS = [
  ['display', 'block'],
  ['width', '100%'],
  ['height', '100%'],
  ['max-width', 'none'],
  ['max-height', 'none'],
  ['object-fit', 'contain'],
  ['border-radius', '1px'],
  ['pointer-events', 'none'],
  ['filter', 'none'],
  ['background', 'transparent'],
] as const;

export interface PreviewTrigger {
  readonly img: HTMLImageElement;
  readonly bounds: Element;
}

function usablePreviewImage(img: HTMLImageElement): HTMLImageElement | null {
  if (img.closest('[data-safari-dark-mode="image-preview"]') !== null) {
    return null;
  }
  return selectPreviewUrls(img).length > 0 ? img : null;
}

function isTightThumbnailWrapper(wrapper: Element, img: HTMLImageElement): boolean {
  if (wrapper instanceof HTMLPictureElement) {
    return true;
  }
  const imgRect = img.getBoundingClientRect();
  const wrapRect = wrapper.getBoundingClientRect();
  if (imgRect.width <= 0 || imgRect.height <= 0 || wrapRect.width <= 0 || wrapRect.height <= 0) {
    return false;
  }
  return wrapRect.width * wrapRect.height <= imgRect.width * imgRect.height * 1.5;
}

function tightBounds(img: HTMLImageElement): Element {
  const picture = img.closest('picture');
  if (picture instanceof HTMLPictureElement) {
    return picture;
  }
  const parent = img.parentElement;
  if (
    parent instanceof Element
    && parent !== img.ownerDocument.body
    && parent !== img.ownerDocument.documentElement
    && isTightThumbnailWrapper(parent, img)
  ) {
    return parent;
  }
  const anchor = img.closest('a');
  if (anchor instanceof HTMLAnchorElement && isTightThumbnailWrapper(anchor, img)) {
    return anchor;
  }
  return img;
}

export function resolvePreviewTrigger(target: EventTarget | null): PreviewTrigger | null {
  if (!(target instanceof Element) || target.closest(`#${IMAGE_PREVIEW_HOST_ID}`) !== null) {
    return null;
  }
  if (target instanceof HTMLImageElement) {
    const img = usablePreviewImage(target);
    if (img !== null) {
      return {img, bounds: tightBounds(img)};
    }
  }
  const ancestor = target.closest('img');
  if (ancestor instanceof HTMLImageElement) {
    const img = usablePreviewImage(ancestor);
    if (img !== null) {
      return {img, bounds: tightBounds(img)};
    }
  }
  const wrapper = target.closest('a, picture');
  if (wrapper instanceof Element) {
    const nested = wrapper.querySelector('img');
    if (nested instanceof HTMLImageElement) {
      const img = usablePreviewImage(nested);
      if (img !== null && isTightThumbnailWrapper(wrapper, img)) {
        return {img, bounds: wrapper};
      }
    }
  }
  return null;
}

function createPreview(
  doc: Document,
  url: string,
  anchor: HTMLImageElement,
  onRatio: (ratio: number) => void,
  onError: () => void,
): HTMLElement {
  const host = doc.createElement('div');
  host.id = IMAGE_PREVIEW_HOST_ID;
  host.dataset.safariDarkMode = 'image-preview';
  host.dataset.previewSrc = url;
  host.setAttribute('aria-hidden', 'true');
  declareStyle(host, HOST_LAYOUT_DECLARATIONS);
  applyPreviewFrame(host);
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
  image.addEventListener('load', () => {
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      queueMicrotask(() => {
        onRatio(image.naturalWidth / image.naturalHeight);
      });
    }
  });
  // Defer so a synchronous error cannot overwrite the host just assigned by show().
  image.addEventListener('error', () => {
    queueMicrotask(onError);
  });
  image.src = url;
  frame.append(image);
  shadow.append(frame);
  positionPreview(host, anchor, anchorRatio(anchor));
  return host;
}

export function installImagePreview(doc: Document = document): () => void {
  if (installed.has(doc)) {
    return () => undefined;
  }
  installed.add(doc);
  ensureSchemeMedia();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  let curImg: HTMLImageElement | undefined;
  let curBounds: Element | undefined;
  let pending: PreviewTrigger | undefined;
  let host: HTMLElement | undefined;
  let generation = 0;
  let activeRatio = 1.5;
  let pointerX = 0;
  let pointerY = 0;

  const cancelTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    pending = undefined;
  };
  const removeHost = (): void => {
    host?.remove();
    host = undefined;
  };
  const hideViewer = (): void => {
    generation += 1;
    removeHost();
  };
  const dismiss = (): void => {
    cancelTimer();
    curImg = undefined;
    curBounds = undefined;
    hideViewer();
  };
  const reposition = (): void => {
    if (host !== undefined && curImg !== undefined) {
      positionPreview(host, curImg, activeRatio);
    }
  };
  const showTrigger = (next: PreviewTrigger): void => {
    const urls = selectPreviewUrls(next.img);
    const first = urls[0];
    if (first === undefined || !next.img.isConnected) {
      return;
    }
    curImg = next.img;
    curBounds = next.bounds;
    if (host?.isConnected === true && host.dataset.previewSrc === first) {
      reposition();
      return;
    }
    activeRatio = anchorRatio(next.img);
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
      host = createPreview(doc, url, next.img, (ratio: number): void => {
        activeRatio = ratio;
        reposition();
      }, () => {
        present(index + 1);
      });
      doc.documentElement.append(host);
    };
    present(0);
  };
  const armShow = (next: PreviewTrigger): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    pending = next;
    timer = setTimeout(() => {
      timer = undefined;
      pending = undefined;
      if (!next.img.isConnected) {
        return;
      }
      if (curImg !== undefined && curImg !== next.img) {
        hideViewer();
        curImg = undefined;
        curBounds = undefined;
      }
      showTrigger(next);
    }, IMAGE_PREVIEW_DELAY_MS);
  };
  const stillOverTrigger = (hit: Element | null, resolved: PreviewTrigger | null): boolean => {
    if (curImg === undefined || curBounds === undefined) {
      return false;
    }
    if (resolved?.img === curImg) {
      return true;
    }
    return hit !== null && (hit === curBounds || curBounds.contains(hit));
  };
  const onOver = (event: Event): void => {
    if (event instanceof MouseEvent) {
      pointerX = event.clientX;
      pointerY = event.clientY;
    }
    const resolved = resolvePreviewTrigger(event.target);
    if (host !== undefined && curImg !== undefined && resolved?.img === curImg) {
      cancelTimer();
      reposition();
      return;
    }
    if (curImg !== undefined && curBounds !== undefined) {
      const targetNode = event.target instanceof Node ? event.target : null;
      const inside = targetNode !== null && (targetNode === curBounds || curBounds.contains(targetNode));
      if (resolved === null && inside) {
        cancelTimer();
        return;
      }
      if (resolved !== null && resolved.img !== curImg) {
        armShow(resolved);
      }
      return;
    }
    if (resolved !== null) {
      armShow(resolved);
      return;
    }
    if (curImg === undefined) {
      cancelTimer();
    }
  };
  const onLeave = (event: Event): void => {
    if (!(event instanceof MouseEvent)) {
      return;
    }
    const bounds = curBounds ?? pending?.bounds;
    if (bounds === undefined) {
      return;
    }
    const target = event.target;
    const related = event.relatedTarget;
    const leavingChild = target instanceof Node && bounds.contains(target) && bounds !== target;
    const relatedInside = related instanceof Node && (related === bounds || bounds.contains(related));
    if (leavingChild || relatedInside) {
      return;
    }
    dismiss();
  };
  const onPointerMove = (event: Event): void => {
    if (!(event instanceof MouseEvent)) {
      return;
    }
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (pending !== undefined) {
      armShow(pending);
    }
  };
  const onKey = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || event.key !== 'Escape' || (curImg === undefined && host === undefined && pending === undefined)) {
      return;
    }
    dismiss();
  };
  const refreshFromPointer = (): void => {
    const hit = typeof doc.elementFromPoint === 'function' ? doc.elementFromPoint(pointerX, pointerY) : null;
    const resolved = resolvePreviewTrigger(hit);
    if (stillOverTrigger(hit, resolved) && curImg !== undefined) {
      cancelTimer();
      reposition();
      return;
    }
    if (resolved !== null && resolved.img !== curImg) {
      armShow(resolved);
      return;
    }
    if (curImg !== undefined || host !== undefined) {
      dismiss();
      return;
    }
    if (pending !== undefined && resolved?.img !== pending.img) {
      dismiss();
    }
  };
  const onScrollOrWheel = (): void => {
    if (curImg === undefined && host === undefined && pending === undefined) {
      return;
    }
    if (scrollTimer !== undefined) {
      clearTimeout(scrollTimer);
    }
    scrollTimer = setTimeout(() => {
      scrollTimer = undefined;
      refreshFromPointer();
    }, PREVIEW_SCROLL_REFRESH_MS);
  };

  const repaintFrame = (): void => {
    if (host !== undefined) {
      applyPreviewFrame(host);
    }
  };
  frameRepaints.add(repaintFrame);
  doc.addEventListener('mouseover', onOver, true);
  doc.addEventListener('mousemove', onPointerMove, true);
  doc.addEventListener('mouseleave', onLeave, true);
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('scroll', onScrollOrWheel, true);
  doc.addEventListener('wheel', onScrollOrWheel, true);
  return () => {
    installed.delete(doc);
    frameRepaints.delete(repaintFrame);
    if (scrollTimer !== undefined) {
      clearTimeout(scrollTimer);
    }
    dismiss();
    doc.removeEventListener('mouseover', onOver, true);
    doc.removeEventListener('mousemove', onPointerMove, true);
    doc.removeEventListener('mouseleave', onLeave, true);
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('scroll', onScrollOrWheel, true);
    doc.removeEventListener('wheel', onScrollOrWheel, true);
  };
}
