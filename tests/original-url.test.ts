import {describe, expect, it} from 'vitest';
import {expandOriginalUrls, type OriginalUrlRule} from '../src/content/original-url';
import {ORIGINAL_URL_RULES} from '../src/content/original-url-rules';

describe('original URL rules', () => {
  it('ships a registry of unique rule ids', () => {
    const ids = ORIGINAL_URL_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'twimg-profile',
      'twimg-banner',
      'twimg-media',
      'weibo-sinaimg',
      'pinterest',
      'imgur',
      'shopify',
      'google-user-content',
      'alicdn-suffix',
      'image-process-query',
      'thumb-suffix',
      'wordpress-dimensions',
      'cloudflare-image',
    ]);
  });

  it('leaves non-http and unmatched URLs alone', () => {
    expect(expandOriginalUrls('')).toEqual([]);
    expect(expandOriginalUrls('not a url')).toEqual([]);
    expect(expandOriginalUrls('data:image/png,abc')).toEqual([]);
    expect(expandOriginalUrls('blob:https://example.com/8b3c')).toEqual([]);
    expect(expandOriginalUrls('https://cdn.example/photo.jpg')).toEqual([]);
  });

  it('accepts an extra host-scoped rule without touching other hosts', () => {
    const rules: readonly OriginalUrlRule[] = [{
      id: 'only-cdn',
      hosts: ['cdn.example'],
      rewrite: (url): readonly string[] => [`${url.origin}/original.jpg`],
    }];
    expect(expandOriginalUrls('https://cdn.example/a.jpg', {}, rules)).toEqual(['https://cdn.example/original.jpg']);
    expect(expandOriginalUrls('https://a.cdn.example/a.jpg', {}, rules)).toEqual(['https://a.cdn.example/original.jpg']);
    expect(expandOriginalUrls('https://images.example/a.jpg', {}, rules)).toEqual([]);
    expect(expandOriginalUrls('https://evilcdn.example/a.jpg', {}, rules)).toEqual([]);
  });

  it('passes the page host through to rules', () => {
    let seen = '';
    const rules: readonly OriginalUrlRule[] = [{
      id: 'read-host',
      rewrite: (_url, context): readonly string[] => {
        seen = context.pageHost ?? '';
        return [];
      },
    }];
    expandOriginalUrls('https://cdn.example/a.jpg', {pageHost: 'x.com'}, rules);
    expect(seen).toBe('x.com');
  });

  it('strips image-process queries without reencoding the rest', () => {
    expect(expandOriginalUrls('https://bucket.oss-cn-hangzhou.aliyuncs.com/a.jpg?x-oss-process=image/resize,m_fill,w_200,h_200')).toEqual([
      'https://bucket.oss-cn-hangzhou.aliyuncs.com/a.jpg',
    ]);
    expect(expandOriginalUrls('https://cdn.example/a.jpg?token=abc&x-oss-process=image/resize,w_100&d=1#p')).toEqual([
      'https://cdn.example/a.jpg?token=abc&d=1#p',
    ]);
    expect(expandOriginalUrls('https://cdn.example/a.jpg?x-image-process=image/resize,w_80&token=abc')).toEqual([
      'https://cdn.example/a.jpg?token=abc',
    ]);
    expect(expandOriginalUrls('https://cdn.example/a.jpg?imageView2/2/w/200')).toEqual([
      'https://cdn.example/a.jpg',
    ]);
    expect(expandOriginalUrls('https://cdn.example/a.jpg?imageMogr2/thumbnail/200x&attname=a.jpg')).toEqual([
      'https://cdn.example/a.jpg?attname=a.jpg',
    ]);
    expect(expandOriginalUrls('https://cdn.example/a.jpg?width=200')).toEqual([]);
  });

  it('strips a safe _thumb suffix and stacks it with WordPress dimensions', () => {
    expect(expandOriginalUrls('https://cdn.example/photos/cat_thumb.jpg?v=1')).toEqual([
      'https://cdn.example/photos/cat.jpg?v=1',
    ]);
    expect(expandOriginalUrls('https://cdn.example/photos/cat_thumbnail.webp')).toEqual([
      'https://cdn.example/photos/cat.webp',
    ]);
    expect(expandOriginalUrls('https://cdn.example/photos/thumbnail.jpg')).toEqual([]);
    expect(expandOriginalUrls('https://cdn.example/photos/_thumb.jpg')).toEqual([]);
    expect(expandOriginalUrls('https://blog.example/wp-content/uploads/cat-300x200.jpg')).toEqual([
      'https://blog.example/wp-content/uploads/cat.jpg',
    ]);
    expect(expandOriginalUrls('https://blog.example/wp-content/uploads/cat-scaled.jpg')).toEqual([
      'https://blog.example/wp-content/uploads/cat.jpg',
    ]);
    expect(expandOriginalUrls('https://blog.example/wp-content/uploads/cat-scaled-300x200.jpg')).toEqual([
      'https://blog.example/wp-content/uploads/cat.jpg',
      'https://blog.example/wp-content/uploads/cat-scaled.jpg',
    ]);
    expect(expandOriginalUrls('https://blog.example/wp-content/uploads/cat_thumb-150x150.jpg')).toEqual([
      'https://blog.example/wp-content/uploads/cat.jpg',
      'https://blog.example/wp-content/uploads/cat_thumb.jpg',
    ]);
    expect(expandOriginalUrls('https://cdn.example/cat-300x200.jpg')).toEqual([]);
  });

  it('unwraps Cloudflare image resizing', () => {
    expect(expandOriginalUrls('https://images.example/cdn-cgi/image/width=80,format=auto/https://cdn.example.com/photo.jpg')).toEqual([
      'https://cdn.example.com/photo.jpg',
    ]);
    expect(expandOriginalUrls('https://images.example/cdn-cgi/image/width=80/https://cdn.example.com/photo.jpg?v=2')).toEqual([
      'https://cdn.example.com/photo.jpg?v=2',
    ]);
    expect(expandOriginalUrls('https://images.example/cdn-cgi/image/width=80/https%3A%2F%2Fcdn.example.com%2Fphoto.jpg')).toEqual([
      'https://cdn.example.com/photo.jpg',
    ]);
    expect(expandOriginalUrls('https://images.example/cdn-cgi/image/width=80,quality=75/wp-content/uploads/a-300x200.jpg')).toEqual([
      'https://images.example/wp-content/uploads/a.jpg',
      'https://images.example/wp-content/uploads/a-300x200.jpg',
    ]);
  });

  it('rewrites Shopify size suffixes and width queries together', () => {
    expect(expandOriginalUrls('https://cdn.shopify.com/s/files/1/0001/0002/products/hat_200x200.jpg')).toEqual([
      'https://cdn.shopify.com/s/files/1/0001/0002/products/hat.jpg',
    ]);
    expect(expandOriginalUrls('https://cdn.shopify.com/s/files/1/0001/0002/products/hat_grande.jpg')).toEqual([
      'https://cdn.shopify.com/s/files/1/0001/0002/products/hat.jpg',
    ]);
    expect(expandOriginalUrls('https://cdn.shopify.com/s/files/1/0001/0002/products/hat_300x.jpg')).toEqual([
      'https://cdn.shopify.com/s/files/1/0001/0002/products/hat.jpg',
    ]);
    expect(expandOriginalUrls('https://cdn.shopify.com/s/files/1/0001/0002/products/hat_x100.webp')).toEqual([
      'https://cdn.shopify.com/s/files/1/0001/0002/products/hat.webp',
    ]);
    expect(expandOriginalUrls('https://cdn.shopify.com/s/files/1/0001/0002/products/hat_200x200_crop_center.jpg')).toEqual([
      'https://cdn.shopify.com/s/files/1/0001/0002/products/hat.jpg',
    ]);
    expect(expandOriginalUrls('https://cdn.shopify.com/s/files/1/0001/0002/products/hat.jpg?v=123&width=300&height=300&crop=center')).toEqual([
      'https://cdn.shopify.com/s/files/1/0001/0002/products/hat.jpg?v=123',
    ]);
    expect(expandOriginalUrls('https://cdn.shopify.com/s/files/1/0001/0002/products/hat_200x.jpg?v=1&width=200')).toEqual([
      'https://cdn.shopify.com/s/files/1/0001/0002/products/hat.jpg?v=1',
    ]);
    expect(expandOriginalUrls('https://cdn.shopify.com/s/files/1/0001/0002/products/hat_blue.jpg')).toEqual([]);
    expect(expandOriginalUrls('https://cdn.shopify.com/s/files/1/0001/0002/products/hat_master.jpg')).toEqual([]);
    expect(expandOriginalUrls('https://cdn.example/hat_grande.jpg')).toEqual([]);
  });

  it('requests google user content at w0', () => {
    expect(expandOriginalUrls('https://lh3.googleusercontent.com/abc=s200-c')).toEqual([
      'https://lh3.googleusercontent.com/abc=w0',
    ]);
    expect(expandOriginalUrls('https://lh3.googleusercontent.com/abc=w200-h200-no')).toEqual([
      'https://lh3.googleusercontent.com/abc=w0',
    ]);
    expect(expandOriginalUrls('https://yt3.ggpht.com/abc=s88-c-k-c0x00ffffff-no-rj')).toEqual([
      'https://yt3.ggpht.com/abc=w0',
    ]);
    expect(expandOriginalUrls('https://lh3.googleusercontent.com/abc=w0')).toEqual([]);
    expect(expandOriginalUrls('https://lh3.googleusercontent.com/abc=s0')).toEqual([]);
    expect(expandOriginalUrls('https://lh3.googleusercontent.com/-abc/s200/photo.jpg')).toEqual([
      'https://lh3.googleusercontent.com/-abc/s0/photo.jpg',
    ]);
    expect(expandOriginalUrls('https://example.com/abc=w200')).toEqual([]);
  });

  it('strips AliCDN size suffixes and prefers the fully cleaned URL', () => {
    expect(expandOriginalUrls('https://img.alicdn.com/imgextra/i1/abc.jpg_400x400.jpg')).toEqual([
      'https://img.alicdn.com/imgextra/i1/abc.jpg',
    ]);
    expect(expandOriginalUrls('https://img.alicdn.com/imgextra/i1/abc.jpg_.webp')).toEqual([
      'https://img.alicdn.com/imgextra/i1/abc.jpg',
    ]);
    expect(expandOriginalUrls('https://img.alicdn.com/imgextra/i1/abc.png_sum.jpg')).toEqual([
      'https://img.alicdn.com/imgextra/i1/abc.png',
    ]);
    expect(expandOriginalUrls('https://gd1.alicdn.com/bao/abc.jpg_q90.jpg')).toEqual([
      'https://gd1.alicdn.com/bao/abc.jpg',
    ]);
    expect(expandOriginalUrls('https://img.alicdn.com/imgextra/i1/abc.jpg_400x400.jpg?x-oss-process=image/resize,w_200')).toEqual([
      'https://img.alicdn.com/imgextra/i1/abc.jpg',
      'https://img.alicdn.com/imgextra/i1/abc.jpg?x-oss-process=image/resize,w_200',
      'https://img.alicdn.com/imgextra/i1/abc.jpg_400x400.jpg',
    ]);
  });

  it('strips Twitter and X image size suffixes', () => {
    expect(expandOriginalUrls('https://pbs.twimg.com/profile_images/1/john_doe_normal.jpg')).toEqual([
      'https://pbs.twimg.com/profile_images/1/john_doe.jpg',
    ]);
    expect(expandOriginalUrls('https://pbs.twimg.com/profile_images/1/john_doe_400x400.jpg')).toEqual([
      'https://pbs.twimg.com/profile_images/1/john_doe.jpg',
    ]);
    expect(expandOriginalUrls('https://pbs.twimg.com/profile_images/1/ada_mini.jpg')).toEqual([
      'https://pbs.twimg.com/profile_images/1/ada.jpg',
    ]);
    expect(expandOriginalUrls('https://pbs.twimg.com/profile_images/1/ada_x96.jpg')).toEqual([
      'https://pbs.twimg.com/profile_images/1/ada.jpg',
    ]);
    expect(expandOriginalUrls('https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png')).toEqual([
      'https://abs.twimg.com/sticky/default_profile_images/default_profile.png',
    ]);
    expect(expandOriginalUrls('https://pbs.twimg.com/profile_images/1/john_doe.jpg')).toEqual([]);
    expect(expandOriginalUrls('https://pbs.twimg.com/profile_banners/99/100/600x200')).toEqual([
      'https://pbs.twimg.com/profile_banners/99/100',
    ]);
    expect(expandOriginalUrls('https://pbs.twimg.com/profile_banners/99/100')).toEqual([]);
    expect(expandOriginalUrls('https://pbs.twimg.com/media/Abc?format=jpg&name=small')).toEqual([
      'https://pbs.twimg.com/media/Abc?format=jpg&name=orig',
    ]);
    expect(expandOriginalUrls('https://pbs.twimg.com/media/Abc?name=900x900&format=webp')).toEqual([
      'https://pbs.twimg.com/media/Abc?name=orig&format=webp',
    ]);
    expect(expandOriginalUrls('https://pbs.twimg.com/media/Abc.jpg:large')).toEqual([
      'https://pbs.twimg.com/media/Abc.jpg:orig',
    ]);
    expect(expandOriginalUrls('https://pbs.twimg.com/media/Abc.jpg:medium?name=small')).toEqual([
      'https://pbs.twimg.com/media/Abc.jpg:orig?name=orig',
    ]);
    expect(expandOriginalUrls('https://pbs.twimg.com/media/Abc.jpg:orig')).toEqual([]);
    expect(expandOriginalUrls('https://pbs.twimg.com/media/Abc.jpg?name=orig')).toEqual([]);
    expect(expandOriginalUrls('https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/abc.jpg?name=small')).toEqual([
      'https://pbs.twimg.com/ext_tw_video_thumb/1/pu/img/abc.jpg?name=orig',
    ]);
  });

  it('replaces Weibo size segments with large', () => {
    expect(expandOriginalUrls('https://wx1.sinaimg.cn/thumbnail/006abc.jpg')).toEqual([
      'https://wx1.sinaimg.cn/large/006abc.jpg',
    ]);
    expect(expandOriginalUrls('https://wx4.sinaimg.cn/orj360/006abc.jpg')).toEqual([
      'https://wx4.sinaimg.cn/large/006abc.jpg',
    ]);
    expect(expandOriginalUrls('https://tvax1.sinaimg.cn/bmiddle/006abc.gif')).toEqual([
      'https://tvax1.sinaimg.cn/large/006abc.gif',
    ]);
    expect(expandOriginalUrls('https://ww1.sinaimg.cn/mw690/006abc.jpg?x=1')).toEqual([
      'https://ww1.sinaimg.cn/large/006abc.jpg?x=1',
    ]);
    expect(expandOriginalUrls('https://wx2.sinaimg.cn/crop.200.200.100/006abc.jpg')).toEqual([
      'https://wx2.sinaimg.cn/large/006abc.jpg',
    ]);
    expect(expandOriginalUrls('https://image.storage.weibo.com/thumbnail/006abc.jpg')).toEqual([
      'https://image.storage.weibo.com/large/006abc.jpg',
    ]);
    expect(expandOriginalUrls('https://wx1.sinaimg.cn/large/006abc.jpg')).toEqual([]);
    expect(expandOriginalUrls('https://wx1.sinaimg.cn/notasize/006abc.jpg')).toEqual([]);
    expect(expandOriginalUrls('https://example.com/thumbnail/006abc.jpg')).toEqual([]);
  });

  it('tries Pinterest originals, then 736x when the source is smaller', () => {
    expect(expandOriginalUrls('https://i.pinimg.com/236x/aa/bb/cc/file.jpg')).toEqual([
      'https://i.pinimg.com/originals/aa/bb/cc/file.jpg',
      'https://i.pinimg.com/736x/aa/bb/cc/file.jpg',
    ]);
    expect(expandOriginalUrls('https://i.pinimg.com/75x75_RS/aa/bb/file.jpg')).toEqual([
      'https://i.pinimg.com/originals/aa/bb/file.jpg',
      'https://i.pinimg.com/736x/aa/bb/file.jpg',
    ]);
    expect(expandOriginalUrls('https://i.pinimg.com/1200x/aa/bb/file.jpg')).toEqual([
      'https://i.pinimg.com/originals/aa/bb/file.jpg',
    ]);
    expect(expandOriginalUrls('https://i.pinimg.com/736x/aa/bb/file.jpg')).toEqual([
      'https://i.pinimg.com/originals/aa/bb/file.jpg',
    ]);
    expect(expandOriginalUrls('https://i.pinimg.com/originals/aa/bb/file.jpg')).toEqual([]);
  });

  it('strips Imgur thumbnail suffixes and downscale queries', () => {
    expect(expandOriginalUrls('https://i.imgur.com/abcdes.jpg')).toEqual([
      'https://i.imgur.com/abcde.jpg',
    ]);
    expect(expandOriginalUrls('https://i.imgur.com/abcdefgl.png')).toEqual([
      'https://i.imgur.com/abcdefg.png',
    ]);
    expect(expandOriginalUrls('https://i.imgur.com/abcdefgh.jpg')).toEqual([
      'https://i.imgur.com/abcdefg.jpg',
    ]);
    expect(expandOriginalUrls('https://i.imgur.com/abcdefg.jpg')).toEqual([]);
    expect(expandOriginalUrls('https://i.imgur.com/abcde.jpg')).toEqual([]);
    expect(expandOriginalUrls('https://i.imgur.com/abcdefg.jpg?maxwidth=520&shape=thumb&fidelity=high')).toEqual([
      'https://i.imgur.com/abcdefg.jpg',
    ]);
    expect(expandOriginalUrls('https://i.imgur.com/abcdes.jpg?maxwidth=200')).toEqual([
      'https://i.imgur.com/abcde.jpg',
    ]);
    expect(expandOriginalUrls('https://imgur.com/abcdes.jpg')).toEqual([]);
  });
});
