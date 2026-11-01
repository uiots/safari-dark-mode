import type {OriginalUrlRule} from './original-url';

const IMAGE_EXT = 'avif|bmp|gif|jpe?g|jxl|png|svg|webp';
const IMAGE_EXTENSION = new RegExp(`\\.(?:${IMAGE_EXT})$`, 'i');
const SHOPIFY_SIZE = new RegExp(
  `_(?:\\d+x\\d+|\\d+x|x\\d+|pico|icon|thumb|small|compact|medium|large|grande)(?:_crop_[a-z]+)?(?=\\.(?:${IMAGE_EXT})$)`,
  'i',
);
const THUMB_SUFFIX = new RegExp(`_(?:thumbnail|thumb)(?=\\.(?:${IMAGE_EXT})$)`, 'i');
const WP_DIMENSIONS = new RegExp(`-\\d{2,4}x\\d{2,4}(?=\\.(?:${IMAGE_EXT})$)`, 'i');
const WP_SCALED = new RegExp(`-scaled(?=\\.(?:${IMAGE_EXT})$)`, 'i');
const PROCESS_KEY = /^(?:x-oss-process|x-image-process|imageview2|imagemogr2|imageview)(?:\/|$)/i;
const GOOGLE_EQUALS = /=[swh]\d[^/]*$/i;
const GOOGLE_ORIGINAL = /^=(?:w0|s0)$/i;
const PICASA_SEGMENT = /^s\d{2,4}(?:-[a-z0-9-]+)?$/i;
const TWIMG_MEDIA = /\/(?:media|card_img|semantic_core_img|tweet_video_thumb|ext_tw_video_thumb|amplify_video_thumb)\//i;
const TWIMG_PROFILE_SIZE = /_(?:reasonably_small|200x200|400x400|normal|bigger|mini|x96)(?=\.[a-z0-9]+$)/i;
const TWIMG_COLON_SIZE = /:(?:small|medium|large|thumb|\d+x\d+)$/i;
const WEIBO_SIZE = /^(?:small|thumbnail|bmiddle|square|thumb\d+|(?:[a-z])?mw\d+|sq\d+|orj\d+|wap\d+|crop\..+)$/i;
const ALICDN_WEBP = /^(.+\.(?:jpe?g|png|gif|webp))_\.webp$/i;
const ALICDN_SIZED = /^(.+\.(?:jpe?g|png|gif|webp))_(?:\d+x\d+[a-z0-9]*|summ?|search|q\d+)\.(?:jpe?g|png|gif|webp)$/i;
const IMGUR_SIZED = /^([A-Za-z0-9]{5}|[A-Za-z0-9]{7})([smbtlh])$/;
const PINTEREST_SIZED = /^(\d+)x(?:\d+(?:_[a-z0-9]+)?)?$/i;
const SHOPIFY_QUERY = new Set(['width', 'height', 'crop']);
const IMGUR_QUERY = new Set(['maxwidth', 'shape', 'fidelity']);

function queryPieces(search: string): string[] {
  if (search.length <= 1) {
    return [];
  }
  return search.slice(1).split('&').filter((piece) => piece !== '');
}

function queryKey(piece: string): string {
  const separator = piece.indexOf('=');
  const raw = separator === -1 ? piece : piece.slice(0, separator);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function decodePiece(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function withPathname(url: URL, pathname: string): string | null {
  const next = new URL(url.href);
  next.pathname = pathname;
  return next.href === url.href ? null : next.href;
}

function withPathAndSearch(url: URL, pathname: string, search: string): string | null {
  const next = new URL(url.href);
  next.pathname = pathname;
  next.search = search;
  return next.href === url.href ? null : next.href;
}

function withoutQueryKeys(search: string, keys: ReadonlySet<string>): string {
  const pieces = queryPieces(search);
  const kept: string[] = [];
  let removed = false;
  for (const piece of pieces) {
    if (keys.has(queryKey(piece).toLowerCase())) {
      removed = true;
      continue;
    }
    kept.push(piece);
  }
  if (!removed) {
    return search;
  }
  return kept.length === 0 ? '' : `?${kept.join('&')}`;
}

function one(value: string | null): readonly string[] {
  return value === null ? [] : [value];
}

function isCloudflareImageWrap(url: URL): boolean {
  return url.pathname.includes('/cdn-cgi/image/');
}

function rewriteTwimgProfile(url: URL): readonly string[] {
  if (!/\/(?:default_)?profile_images\//i.test(url.pathname)) {
    return [];
  }
  const pathname = url.pathname.replace(TWIMG_PROFILE_SIZE, '');
  if (pathname === url.pathname) {
    return [];
  }
  return one(withPathname(url, pathname));
}

function rewriteTwimgBanner(url: URL): readonly string[] {
  const match = /\/profile_banners\/([^/]+)\/([^/]+)\/\d+x\d+\/?$/i.exec(url.pathname);
  const user = match?.[1];
  const stamp = match?.[2];
  if (user === undefined || stamp === undefined) {
    return [];
  }
  return one(withPathname(url, `/profile_banners/${user}/${stamp}`));
}

function rewriteTwimgMedia(url: URL): readonly string[] {
  if (!TWIMG_MEDIA.test(url.pathname)) {
    return [];
  }
  let pathname = url.pathname;
  const colon = TWIMG_COLON_SIZE.exec(pathname);
  if (colon !== null) {
    pathname = `${pathname.slice(0, colon.index)}:orig`;
  }
  const renamed = queryPieces(url.search).map((piece) => {
    if (queryKey(piece).toLowerCase() !== 'name') {
      return {piece, changed: false};
    }
    const separator = piece.indexOf('=');
    const value = separator === -1 ? '' : piece.slice(separator + 1);
    if (decodePiece(value).toLowerCase() === 'orig') {
      return {piece, changed: false};
    }
    const key = separator === -1 ? piece : piece.slice(0, separator);
    return {piece: `${key}=orig`, changed: true};
  });
  const nameChanged = renamed.some((item) => item.changed);
  if (pathname === url.pathname && !nameChanged) {
    return [];
  }
  const search = nameChanged ? `?${renamed.map((item) => item.piece).join('&')}` : url.search;
  return one(withPathAndSearch(url, pathname, search));
}

function rewriteWeibo(url: URL): readonly string[] {
  const parts = url.pathname.split('/');
  const size = parts[parts.length - 2];
  if (parts.length < 3 || size === undefined || !WEIBO_SIZE.test(size)) {
    return [];
  }
  parts[parts.length - 2] = 'large';
  return one(withPathname(url, parts.join('/')));
}

function rewritePinterest(url: URL): readonly string[] {
  const parts = url.pathname.split('/');
  const segment = parts[1];
  if (segment === undefined || segment.toLowerCase() === 'originals') {
    return [];
  }
  const sized = PINTEREST_SIZED.exec(segment);
  const widthText = sized?.[1];
  if (widthText === undefined) {
    return [];
  }
  const width = Number(widthText);
  const results: string[] = [];
  const originals = [...parts];
  originals[1] = 'originals';
  const originalUrl = withPathname(url, originals.join('/'));
  if (originalUrl !== null) {
    results.push(originalUrl);
  }
  if (width < 736) {
    const medium = [...parts];
    medium[1] = '736x';
    const mediumUrl = withPathname(url, medium.join('/'));
    if (mediumUrl !== null) {
      results.push(mediumUrl);
    }
  }
  return results;
}

function rewriteImgur(url: URL): readonly string[] {
  if (!IMAGE_EXTENSION.test(url.pathname)) {
    return [];
  }
  const fileStart = url.pathname.lastIndexOf('/') + 1;
  const file = url.pathname.slice(fileStart);
  const dot = file.lastIndexOf('.');
  const stem = file.slice(0, dot);
  const extension = file.slice(dot);
  const sized = IMGUR_SIZED.exec(stem);
  const id = sized?.[1];
  const pathname = id === undefined ? url.pathname : `${url.pathname.slice(0, fileStart)}${id}${extension}`;
  const search = withoutQueryKeys(url.search, IMGUR_QUERY);
  if (pathname === url.pathname && search === url.search) {
    return [];
  }
  return one(withPathAndSearch(url, pathname, search));
}

function rewriteShopify(url: URL): readonly string[] {
  if (!url.pathname.includes('/s/files/')) {
    return [];
  }
  const pathname = url.pathname.replace(SHOPIFY_SIZE, '');
  const search = withoutQueryKeys(url.search, SHOPIFY_QUERY);
  if (pathname === url.pathname && search === url.search) {
    return [];
  }
  return one(withPathAndSearch(url, pathname, search));
}

function rewriteGoogleUserContent(url: URL): readonly string[] {
  let pathname = url.pathname;
  const equals = GOOGLE_EQUALS.exec(pathname);
  const token = equals?.[0];
  if (equals !== null && token !== undefined && !GOOGLE_ORIGINAL.test(token)) {
    pathname = `${pathname.slice(0, equals.index)}=w0`;
  }
  const parts = pathname.split('/');
  let segmentChanged = false;
  for (let index = 0; index < parts.length; index += 1) {
    const segment = parts[index];
    if (segment !== undefined && PICASA_SEGMENT.test(segment)) {
      parts[index] = 's0';
      segmentChanged = true;
    }
  }
  if (segmentChanged) {
    pathname = parts.join('/');
  }
  if (pathname === url.pathname) {
    return [];
  }
  return one(withPathname(url, pathname));
}

function rewriteAlicdnSuffix(url: URL): readonly string[] {
  let pathname = url.pathname;
  const webp = ALICDN_WEBP.exec(pathname);
  const webpStem = webp?.[1];
  if (webpStem !== undefined) {
    pathname = webpStem;
  }
  const sized = ALICDN_SIZED.exec(pathname);
  const sizedStem = sized?.[1];
  if (sizedStem !== undefined) {
    pathname = sizedStem;
  }
  if (pathname === url.pathname) {
    return [];
  }
  return one(withPathname(url, pathname));
}

function rewriteProcessQuery(url: URL): readonly string[] {
  if (isCloudflareImageWrap(url)) {
    return [];
  }
  const pieces = queryPieces(url.search);
  if (pieces.length === 0) {
    return [];
  }
  const kept: string[] = [];
  let removed = false;
  for (const piece of pieces) {
    if (PROCESS_KEY.test(queryKey(piece))) {
      removed = true;
      continue;
    }
    kept.push(piece);
  }
  if (!removed) {
    return [];
  }
  const next = new URL(url.href);
  next.search = kept.length === 0 ? '' : `?${kept.join('&')}`;
  return next.href === url.href ? [] : [next.href];
}

function rewriteThumbSuffix(url: URL): readonly string[] {
  if (isCloudflareImageWrap(url)) {
    return [];
  }
  const pathname = url.pathname.replace(THUMB_SUFFIX, '');
  if (pathname === url.pathname) {
    return [];
  }
  const file = pathname.slice(pathname.lastIndexOf('/') + 1);
  if (file === '' || file.startsWith('.')) {
    return [];
  }
  return one(withPathname(url, pathname));
}

function rewriteWordpress(url: URL): readonly string[] {
  if (isCloudflareImageWrap(url) || !url.pathname.toLowerCase().includes('/wp-content/')) {
    return [];
  }
  const withoutDimensions = url.pathname.replace(WP_DIMENSIONS, '');
  const withoutBoth = withoutDimensions.replace(WP_SCALED, '');
  const results: string[] = [];
  if (withoutBoth !== url.pathname) {
    const full = withPathname(url, withoutBoth);
    if (full !== null) {
      results.push(full);
    }
  }
  if (withoutDimensions !== url.pathname && withoutDimensions !== withoutBoth) {
    const partial = withPathname(url, withoutDimensions);
    if (partial !== null) {
      results.push(partial);
    }
  }
  return results;
}

function rewriteCloudflareImages(url: URL): readonly string[] {
  const marker = '/cdn-cgi/image/';
  const index = url.pathname.indexOf(marker);
  if (index < 0) {
    return [];
  }
  const rest = url.pathname.slice(index + marker.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) {
    return [];
  }
  const rawTarget = rest.slice(slash + 1);
  if (rawTarget === '') {
    return [];
  }
  const decoded = /^https?:\/\//i.test(rawTarget) ? rawTarget : decodePiece(rawTarget);
  if (/^https?:\/\//i.test(decoded)) {
    try {
      const absolute = new URL(`${decoded}${url.search}${url.hash}`);
      if (absolute.href === url.href || (absolute.protocol !== 'http:' && absolute.protocol !== 'https:')) {
        return [];
      }
      return [absolute.href];
    } catch {
      return [];
    }
  }
  const joined = `${url.pathname.slice(0, index)}/${rawTarget}`.replace(/\/{2,}/g, '/');
  const pathname = joined.startsWith('/') ? joined : `/${joined}`;
  return one(withPathname(url, pathname));
}

export const ORIGINAL_URL_RULES: readonly OriginalUrlRule[] = [
  {id: 'twimg-profile', hosts: ['twimg.com'], rewrite: rewriteTwimgProfile},
  {id: 'twimg-banner', hosts: ['twimg.com'], rewrite: rewriteTwimgBanner},
  {id: 'twimg-media', hosts: ['twimg.com'], rewrite: rewriteTwimgMedia},
  {id: 'weibo-sinaimg', hosts: ['sinaimg.cn', 'image.storage.weibo.com'], rewrite: rewriteWeibo},
  {id: 'pinterest', hosts: ['pinimg.com'], rewrite: rewritePinterest},
  {id: 'imgur', hosts: ['i.imgur.com'], rewrite: rewriteImgur},
  {id: 'shopify', hosts: ['cdn.shopify.com'], rewrite: rewriteShopify},
  {id: 'google-user-content', hosts: ['googleusercontent.com', 'ggpht.com'], rewrite: rewriteGoogleUserContent},
  {id: 'alicdn-suffix', hosts: ['alicdn.com', 'alibaba.com'], rewrite: rewriteAlicdnSuffix},
  {id: 'image-process-query', rewrite: rewriteProcessQuery},
  {id: 'thumb-suffix', rewrite: rewriteThumbSuffix},
  {id: 'wordpress-dimensions', rewrite: rewriteWordpress},
  {id: 'cloudflare-image', rewrite: rewriteCloudflareImages},
];
