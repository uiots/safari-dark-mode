import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {IMAGE_PREVIEW_DELAY_MS, IMAGE_PREVIEW_HOST_ID, installImagePreview, selectPreviewUrl, selectPreviewUrls} from '../src/content/image-preview';

function image(markup: string): HTMLImageElement {
  const holder = document.createElement('div');
  holder.innerHTML = markup;
  document.body.append(holder);
  const img = holder.querySelector('img');
  if (!(img instanceof HTMLImageElement)) {
    throw new Error('fixture is missing an image');
  }
  return img;
}

function setIntrinsic(img: HTMLImageElement, width: number, height: number, currentSrc?: string): void {
  Object.defineProperty(img, 'naturalWidth', {configurable: true, value: width});
  Object.defineProperty(img, 'naturalHeight', {configurable: true, value: height});
  if (currentSrc !== undefined) {
    Object.defineProperty(img, 'currentSrc', {configurable: true, get: () => currentSrc});
  }
}

function hover(img: HTMLImageElement): void {
  img.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));
}

function leave(img: HTMLImageElement): void {
  img.dispatchEvent(new MouseEvent('mouseout', {bubbles: true, relatedTarget: document.body}));
}

describe('preview URL selection', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers an explicit original over the displayed thumbnail', () => {
    const img = image('<img src="https://cdn.example/thumb.jpg" data-original="https://cdn.example/original.jpg">');
    setIntrinsic(img, 120, 80);
    expect(selectPreviewUrl(img)).toBe('https://cdn.example/original.jpg');
  });

  it('ignores non-URL original attributes and uses the loaded image', () => {
    const img = image('<img src="https://cdn.example/photo.jpg" data-full="true" data-large="800">');
    setIntrinsic(img, 800, 600);
    expect(selectPreviewUrl(img)).toBe('https://cdn.example/photo.jpg');
  });

  it('uses a parent link when it points at an image file', () => {
    const linked = image('<a href="https://cdn.example/full.jpg"><img src="https://cdn.example/thumb.jpg"></a>');
    setIntrinsic(linked, 160, 120);
    expect(selectPreviewUrl(linked)).toBe('https://cdn.example/full.jpg');

    const article = image('<a href="https://example.com/posts/1"><img src="https://cdn.example/photo.jpg"></a>');
    setIntrinsic(article, 800, 600);
    expect(selectPreviewUrl(article)).toBe('https://cdn.example/photo.jpg');
  });

  it('picks the largest srcset candidate, including picture sources', () => {
    const responsive = image('<img src="https://cdn.example/400.jpg" srcset="https://cdn.example/400.jpg 400w, https://cdn.example/1600.jpg 1600w">');
    expect(selectPreviewUrl(responsive)).toBe('https://cdn.example/1600.jpg');

    const picture = image('<picture><source srcset="https://cdn.example/wide.jpg 2000w"><img src="https://cdn.example/fallback.jpg"></picture>');
    expect(selectPreviewUrl(picture)).toBe('https://cdn.example/wide.jpg');

    const dense = image('<img src="https://cdn.example/1x.jpg" srcset="https://cdn.example/1x.jpg 1x, https://cdn.example/3x.jpg 3x">');
    setIntrinsic(dense, 100, 100, 'https://cdn.example/1x.jpg');
    expect(selectPreviewUrl(dense)).toBe('https://cdn.example/3x.jpg');
  });

  it('keeps the loaded bitmap when it is already larger than srcset', () => {
    const img = image('<img src="https://cdn.example/original.jpg" srcset="https://cdn.example/400.jpg 400w, https://cdn.example/800.jpg 800w">');
    setIntrinsic(img, 2400, 1600, 'https://cdn.example/original.jpg');
    expect(selectPreviewUrl(img)).toBe('https://cdn.example/original.jpg');
  });

  it('uses lazy URLs while the displayed src is still a placeholder', () => {
    const placeholder = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const lazy = image(`<img src="${placeholder}" data-src="https://cdn.example/photo.jpg">`);
    setIntrinsic(lazy, 1, 1);
    expect(selectPreviewUrl(lazy)).toBe('https://cdn.example/photo.jpg');

    const srcset = image(`<img src="${placeholder}" data-srcset="https://cdn.example/small.jpg 100w, https://cdn.example/large.jpg 1400w">`);
    expect(selectPreviewUrl(srcset)).toBe('https://cdn.example/large.jpg');
  });

  it('keeps a comma inside a data-url srcset candidate', () => {
    const raw = 'data:image/svg+xml,<svg></svg>';
    const img = image(`<img src="https://cdn.example/small.jpg" srcset="https://cdn.example/small.jpg 1x, ${raw} 3x">`);
    expect(selectPreviewUrl(img)).toBe(new URL(raw).href);
  });

  it('keeps displayed images behind a link whose path only looks like a file', () => {
    const img = image([
      '<a href="https://en.wikipedia.org/wiki/File:Cat.jpg">',
      '<img src="https://upload.wikimedia.org/thumb.jpg" srcset="https://upload.wikimedia.org/thumb.jpg 320w, https://upload.wikimedia.org/larger.jpg 960w">',
      '</a>',
    ].join(''));
    setIntrinsic(img, 320, 200, 'https://upload.wikimedia.org/thumb.jpg');
    expect(selectPreviewUrls(img)).toEqual([
      'https://en.wikipedia.org/wiki/File:Cat.jpg',
      'https://upload.wikimedia.org/larger.jpg',
      'https://upload.wikimedia.org/thumb.jpg',
    ]);
  });

  it('skips loaded icons that have no larger source', () => {
    const icon = image('<img src="https://cdn.example/icon.png" width="16" height="16">');
    setIntrinsic(icon, 16, 16);
    expect(selectPreviewUrl(icon)).toBeNull();

    const retina = image('<img src="https://cdn.example/icon.png" srcset="https://cdn.example/icon.png 1x, https://cdn.example/icon@2x.png 2x">');
    setIntrinsic(retina, 16, 16, 'https://cdn.example/icon.png');
    expect(selectPreviewUrl(retina)).toBeNull();

    const unloaded = image('<img src="https://cdn.example/photo.jpg">');
    expect(selectPreviewUrl(unloaded)).toBe('https://cdn.example/photo.jpg');
  });
});

describe('hover preview lifecycle', () => {
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    uninstall = installImagePreview();
  });

  afterEach(() => {
    uninstall?.();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('shows a pass-through overlay after a short hover and removes it on leave', () => {
    const img = image('<img src="https://cdn.example/photo.jpg">');
    setIntrinsic(img, 800, 600);
    hover(img);
    vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS - 1);
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).toBeNull();
    vi.advanceTimersByTime(1);
    const host = document.getElementById(IMAGE_PREVIEW_HOST_ID);
    expect(host?.dataset.previewSrc).toBe('https://cdn.example/photo.jpg');
    expect(host?.dataset.safariDarkMode).toBe('image-preview');
    expect(host?.getAttribute('aria-hidden')).toBe('true');
    expect(host?.shadowRoot).toBeNull();
    expect(host?.style.getPropertyValue('pointer-events')).toBe('none');
    expect(host?.style.getPropertyPriority('z-index')).toBe('important');
    expect(host?.style.getPropertyValue('z-index')).toBe('2147483647');
    leave(img);
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).toBeNull();
  });

  it('does not show when the pointer leaves before the delay', () => {
    const img = image('<img src="https://cdn.example/photo.jpg">');
    setIntrinsic(img, 800, 600);
    hover(img);
    vi.advanceTimersByTime(40);
    leave(img);
    vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS);
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).toBeNull();
  });

  it('dismisses on Escape or scroll and ignores other keys', () => {
    const img = image('<img src="https://cdn.example/photo.jpg">');
    setIntrinsic(img, 800, 600);
    hover(img);
    vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS);
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).toBeNull();

    hover(img);
    vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS);
    const scroller = document.createElement('div');
    document.body.append(scroller);
    scroller.dispatchEvent(new Event('scroll', {bubbles: false}));
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).toBeNull();
  });

  it('follows a later image instead of flashing the one passed over', () => {
    const first = image('<img src="https://cdn.example/first.jpg">');
    const second = image('<img src="https://cdn.example/second.jpg">');
    setIntrinsic(first, 400, 300);
    setIntrinsic(second, 400, 300);
    hover(first);
    vi.advanceTimersByTime(80);
    leave(first);
    hover(second);
    vi.advanceTimersByTime(80);
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).toBeNull();
    vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS);
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)?.dataset.previewSrc).toBe('https://cdn.example/second.jpg');
  });

  it('installs once and removes its listeners on uninstall', () => {
    const second = installImagePreview();
    uninstall?.();
    second();
    const img = image('<img src="https://cdn.example/photo.jpg">');
    setIntrinsic(img, 400, 300);
    hover(img);
    vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS);
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).toBeNull();
    uninstall = undefined;
  });
});
