import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {IMAGE_PREVIEW_DELAY_MS, IMAGE_PREVIEW_HOST_ID, PREVIEW_GAP_PX, PREVIEW_SCROLL_REFRESH_MS, PREVIEW_VIEWPORT_MARGIN_PX, installImagePreview, placePreview, previewFrameDeclarations, previewFrameIsDark, previewSchemeFromPageStatus, resolvePreviewTrigger, selectPreviewUrl, selectPreviewUrls, setImagePreviewScheme} from '../src/content/image-preview';

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

function leave(target: Element, related: EventTarget | null = document.body): void {
  target.dispatchEvent(new MouseEvent('mouseleave', {bubbles: false, relatedTarget: related}));
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

  it('resolves a picture wrapper from a child hit target', () => {
    const img = image('<picture><span class="hit"></span><img src="https://cdn.example/photo.jpg"></picture>');
    setIntrinsic(img, 400, 300);
    const hit = img.parentElement?.querySelector('.hit');
    const trigger = resolvePreviewTrigger(hit ?? null);
    expect(trigger?.img).toBe(img);
    expect(trigger?.bounds).toBe(img.parentElement);
  });

  it('prefers a rewritten CDN original ahead of the loaded thumbnail', () => {
    const media = image('<img src="https://pbs.twimg.com/media/Abc?format=jpg&name=small">');
    setIntrinsic(media, 240, 160, 'https://pbs.twimg.com/media/Abc?format=jpg&name=small');
    expect(selectPreviewUrls(media)).toEqual([
      'https://pbs.twimg.com/media/Abc?format=jpg&name=orig',
      'https://pbs.twimg.com/media/Abc?format=jpg&name=small',
    ]);

    const shop = image([
      '<img src="https://cdn.shopify.com/s/files/1/2/3/files/hat_100x.jpg"',
      ' srcset="https://cdn.shopify.com/s/files/1/2/3/files/hat_100x.jpg 100w, https://cdn.shopify.com/s/files/1/2/3/files/hat_600x.jpg 600w">',
    ].join(''));
    expect(selectPreviewUrls(shop)[0]).toBe('https://cdn.shopify.com/s/files/1/2/3/files/hat.jpg');
    expect(selectPreviewUrls(shop)).toContain('https://cdn.shopify.com/s/files/1/2/3/files/hat_600x.jpg');
  });

  it('keeps an explicit original ahead of a rewrite of the thumbnail', () => {
    const img = image('<img src="https://i.imgur.com/abcdefgs.jpg" data-original="https://cdn.example/explicit.jpg">');
    setIntrinsic(img, 200, 200);
    expect(selectPreviewUrls(img)).toEqual([
      'https://cdn.example/explicit.jpg',
      'https://i.imgur.com/abcdefg.jpg',
      'https://i.imgur.com/abcdefgs.jpg',
    ]);
  });

  it('previews a rewritten avatar when the bitmap itself is icon-sized', () => {
    const img = image('<img src="https://pbs.twimg.com/profile_images/7/ada_mini.jpg">');
    setIntrinsic(img, 24, 24);
    expect(selectPreviewUrls(img)).toEqual(['https://pbs.twimg.com/profile_images/7/ada.jpg']);
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

function box(left: number, top: number, width: number, height: number): {left: number; top: number; right: number; bottom: number; width: number; height: number} {
  return {left, top, right: left + width, bottom: top + height, width, height};
}

describe('preview placement', () => {
  const viewport = {width: 1200, height: 800};

  it('fills the open side beside the thumbnail instead of centering', () => {
    const anchor = box(40, 200, 160, 120);
    const placement = placePreview(anchor, viewport, 3 / 2);
    const freeRight = viewport.width - PREVIEW_VIEWPORT_MARGIN_PX - (anchor.right + PREVIEW_GAP_PX);
    expect(placement.side).toBe('right');
    expect(placement.left).toBeCloseTo(anchor.right + PREVIEW_GAP_PX);
    expect(placement.width).toBeCloseTo(freeRight);
    expect(placement.height).toBeGreaterThan(400);
    expect(placement.height).toBeLessThan(viewport.height);
    expect(placement.top).toBe(PREVIEW_VIEWPORT_MARGIN_PX);
    expect(placement.left + placement.width).toBeLessThanOrEqual(viewport.width - PREVIEW_VIEWPORT_MARGIN_PX + 0.01);
  });

  it('uses the full free height when a tall image fits beside the thumbnail', () => {
    const anchor = box(16, 360, 80, 80);
    const placement = placePreview(anchor, {width: 1400, height: 800}, 0.5);
    expect(placement.side).toBe('right');
    expect(placement.left).toBeCloseTo(anchor.right + PREVIEW_GAP_PX);
    expect(placement.height).toBeCloseTo(800 - PREVIEW_VIEWPORT_MARGIN_PX * 2);
    expect(placement.width).toBeGreaterThan(300);
    expect(placement.width).toBeLessThan(1400 - anchor.right);
  });

  it('flips to the opposite side when the preferred side is too tight', () => {
    const anchor = box(800, 300, 160, 120);
    const placement = placePreview(anchor, {width: 1000, height: 800}, 3 / 2);
    expect(placement.side).toBe('left');
    expect(placement.left + placement.width).toBeCloseTo(anchor.left - PREVIEW_GAP_PX);
    expect(placement.left).toBeGreaterThanOrEqual(PREVIEW_VIEWPORT_MARGIN_PX);
  });

  it('prefers the right side when left and right can show the same size', () => {
    const anchor = box(750, 260, 100, 80);
    const placement = placePreview(anchor, {width: 1600, height: 600}, 4 / 3);
    expect(placement.side).toBe('right');
    expect(placement.left).toBeCloseTo(anchor.right + PREVIEW_GAP_PX);
  });

  it('drops below the thumbnail when that side can show a larger preview', () => {
    const anchor = box(150, 20, 100, 80);
    const placement = placePreview(anchor, {width: 400, height: 900}, 1);
    expect(placement.side).toBe('bottom');
    expect(placement.top).toBeCloseTo(anchor.bottom + PREVIEW_GAP_PX);
    expect(placement.width).toBeGreaterThan(300);
    expect(placement.height).toBeGreaterThan(300);
    expect(placement.top + placement.height).toBeLessThanOrEqual(900 - PREVIEW_VIEWPORT_MARGIN_PX + 0.01);
  });
});

describe('preview frame', () => {
  it('uses the Imagus light frame unless the extension is darkening the page', () => {
    expect(previewSchemeFromPageStatus('forced')).toBe(true);
    expect(previewSchemeFromPageStatus('darkened')).toBe(true);
    expect(previewSchemeFromPageStatus('native-dark')).toBe(true);
    expect(previewSchemeFromPageStatus('disabled')).toBe(false);
    expect(previewSchemeFromPageStatus('unsupported')).toBeNull();
    expect(previewFrameIsDark(true, false)).toBe(true);
    expect(previewFrameIsDark(false, true)).toBe(false);
    expect(previewFrameIsDark(null, true)).toBe(true);
    expect(previewFrameIsDark(null, false)).toBe(false);

    const light = Object.fromEntries(previewFrameDeclarations(false));
    const dark = Object.fromEntries(previewFrameDeclarations(true));
    expect(light).toMatchObject({
      'background-color': '#f8f8ff',
      'background-clip': 'padding-box',
      border: '3px solid hsla(0, 0%, 95%, 0.6)',
      'border-radius': '2px',
      'box-shadow': '0 0 2px #666',
      padding: '3px',
    });
    expect(dark['border-radius']).toBe('2px');
    expect(dark.padding).toBe('3px');
    expect(dark.border).toMatch(/^3px solid /);
    expect(dark['background-color']).not.toBe(light['background-color']);
    expect(dark['box-shadow']).not.toBe(light['box-shadow']);
  });
});

describe('hover preview lifecycle', () => {
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    setImagePreviewScheme(false);
    uninstall = installImagePreview();
  });

  afterEach(() => {
    uninstall?.();
    setImagePreviewScheme(null);
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('anchors the shown overlay beside the thumbnail', () => {
    const img = image('<img src="https://cdn.example/photo.jpg">');
    setIntrinsic(img, 300, 200);
    const anchor = box(40, 200, 160, 120);
    vi.spyOn(img, 'getBoundingClientRect').mockReturnValue(new DOMRect(anchor.left, anchor.top, anchor.width, anchor.height));
    const previousWidth = window.innerWidth;
    const previousHeight = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', {configurable: true, value: 1200});
    Object.defineProperty(window, 'innerHeight', {configurable: true, value: 800});
    try {
      hover(img);
      vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS);
      const host = document.getElementById(IMAGE_PREVIEW_HOST_ID);
      const expected = placePreview(anchor, {width: 1200, height: 800}, 300 / 200);
      expect(host?.dataset.previewSide).toBe('right');
      expect(host?.style.getPropertyValue('left')).toBe(`${String(expected.left)}px`);
      expect(host?.style.getPropertyValue('width')).toBe(`${String(expected.width)}px`);
      expect(Number.parseFloat(host?.style.getPropertyValue('left') ?? '')).toBeGreaterThan(anchor.right);
    } finally {
      Object.defineProperty(window, 'innerWidth', {configurable: true, value: previousWidth});
      Object.defineProperty(window, 'innerHeight', {configurable: true, value: previousHeight});
    }
  });

  it('shows the rewritten original in the hover preview', () => {
    const img = image('<img src="https://pbs.twimg.com/media/Abc?format=jpg&name=small">');
    setIntrinsic(img, 320, 200);
    hover(img);
    vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS);
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)?.dataset.previewSrc).toBe(
      'https://pbs.twimg.com/media/Abc?format=jpg&name=orig',
    );
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
    expect(host?.style.getPropertyValue('position')).toBe('fixed');
    expect(host?.style.getPropertyValue('inset')).toBe('');
    expect(host?.style.getPropertyValue('background-color')).toBe('rgb(248, 248, 255)');
    expect(host?.style.getPropertyValue('border-radius')).toBe('2px');
    expect(host?.style.getPropertyValue('border-top-width')).toBe('3px');
    expect(host?.style.getPropertyValue('padding-top')).toBe('3px');
    expect(host?.style.getPropertyValue('box-shadow')).toContain('2px');
    leave(img);
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).toBeNull();
  });

  it('resets the show delay while the pointer keeps moving', () => {
    const img = image('<img src="https://cdn.example/photo.jpg">');
    setIntrinsic(img, 800, 600);
    hover(img);
    vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS - 40);
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).toBeNull();
    img.dispatchEvent(new MouseEvent('mousemove', {bubbles: true, clientX: 12, clientY: 12}));
    vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS - 40);
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).toBeNull();
    vi.advanceTimersByTime(40);
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)?.dataset.previewSrc).toBe('https://cdn.example/photo.jpg');
  });

  it('keeps a visible preview when the pointer moves on the same thumbnail', () => {
    const img = image('<img src="https://cdn.example/photo.jpg">');
    setIntrinsic(img, 800, 600);
    hover(img);
    vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS);
    const host = document.getElementById(IMAGE_PREVIEW_HOST_ID);
    img.dispatchEvent(new MouseEvent('mousemove', {bubbles: true, clientX: 20, clientY: 20}));
    vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS);
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).toBe(host);
  });

  it('repaints an open preview when the extension scheme changes', () => {
    const img = image('<img src="https://cdn.example/photo.jpg">');
    setIntrinsic(img, 800, 600);
    hover(img);
    vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS);
    const host = document.getElementById(IMAGE_PREVIEW_HOST_ID);
    expect(host?.style.getPropertyValue('background-color')).toBe('rgb(248, 248, 255)');
    setImagePreviewScheme(true);
    expect(host?.style.getPropertyValue('background-color')).not.toBe('rgb(248, 248, 255)');
    expect(host?.style.getPropertyValue('border-top-width')).toBe('3px');
    expect(host?.style.getPropertyValue('border-radius')).toBe('2px');
    setImagePreviewScheme(false);
    expect(host?.style.getPropertyValue('background-color')).toBe('rgb(248, 248, 255)');
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

  it('dismisses on Escape and ignores other keys', () => {
    const img = image('<img src="https://cdn.example/photo.jpg">');
    setIntrinsic(img, 800, 600);
    hover(img);
    vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS);
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).toBeNull();
  });

  it('does not dismiss on mouseout, or when the pointer is still inside the thumbnail', () => {
    const img = image('<picture><img src="https://cdn.example/photo.jpg"><span class="cap"></span></picture>');
    setIntrinsic(img, 800, 600);
    const cap = img.parentElement?.querySelector('.cap');
    if (!(cap instanceof HTMLElement) || img.parentElement === null) {
      throw new Error('fixture is missing the picture wrapper');
    }
    hover(img);
    vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS);
    img.dispatchEvent(new MouseEvent('mouseout', {bubbles: true, relatedTarget: document.body}));
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).not.toBeNull();
    leave(img, cap);
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).not.toBeNull();
    leave(cap, document.body);
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).not.toBeNull();
    leave(img.parentElement, document.body);
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).toBeNull();
  });

  it('keeps the current preview until the delay when moving to another image', () => {
    const first = image('<img src="https://cdn.example/first.jpg">');
    const second = image('<img src="https://cdn.example/second.jpg">');
    setIntrinsic(first, 400, 300);
    setIntrinsic(second, 400, 300);
    hover(first);
    vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS);
    const host = document.getElementById(IMAGE_PREVIEW_HOST_ID);
    hover(second);
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)).toBe(host);
    expect(host?.dataset.previewSrc).toBe('https://cdn.example/first.jpg');
    vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS - 1);
    expect(host?.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(document.getElementById(IMAGE_PREVIEW_HOST_ID)?.dataset.previewSrc).toBe('https://cdn.example/second.jpg');
  });

  it('repositions on scroll while the pointer stays on the image', () => {
    const img = image('<img src="https://cdn.example/photo.jpg">');
    setIntrinsic(img, 300, 200);
    const anchor = box(40, 200, 160, 120);
    const rect = vi.spyOn(img, 'getBoundingClientRect').mockReturnValue(new DOMRect(anchor.left, anchor.top, anchor.width, anchor.height));
    Object.defineProperty(document, 'elementFromPoint', {configurable: true, value: () => img});
    hover(img);
    vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS);
    const before = document.getElementById(IMAGE_PREVIEW_HOST_ID)?.style.getPropertyValue('left');
    rect.mockReturnValue(new DOMRect(80, 220, 160, 120));
    document.dispatchEvent(new Event('scroll', {bubbles: false}));
    vi.advanceTimersByTime(PREVIEW_SCROLL_REFRESH_MS);
    const host = document.getElementById(IMAGE_PREVIEW_HOST_ID);
    expect(host).not.toBeNull();
    expect(host?.style.getPropertyValue('left')).not.toBe(before);
    expect(host?.dataset.previewSrc).toBe('https://cdn.example/photo.jpg');
  });

  it('dismisses on scroll when the pointer is no longer over the image', () => {
    const img = image('<img src="https://cdn.example/photo.jpg">');
    setIntrinsic(img, 800, 600);
    hover(img);
    vi.advanceTimersByTime(IMAGE_PREVIEW_DELAY_MS);
    Object.defineProperty(document, 'elementFromPoint', {configurable: true, value: () => document.body});
    document.body.dispatchEvent(new Event('wheel', {bubbles: true}));
    vi.advanceTimersByTime(PREVIEW_SCROLL_REFRESH_MS);
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
