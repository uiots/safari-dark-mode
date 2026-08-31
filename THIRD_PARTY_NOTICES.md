# Third-party notices

## Dark Reader

Safari Dark Mode uses the Dark Reader rendering API, dynamic-theme fixes, and detector hints from exact upstream tag **v4.9.129** (commit `c2a707302a39b8047543712e9c582bac07835d34`).

- Project: <https://github.com/darkreader/darkreader>
- Tag: <https://github.com/darkreader/darkreader/releases/tag/v4.9.129>
- Copyright: Alexander Shutau and Dark Reader contributors
- License: MIT; the complete upstream license is preserved at `src/vendor/darkreader/LICENSE`.

Vendored checksums:

```text
darkreader.mjs               3145983ebba854c05b1a0757a31d30c9726f7dba91c57cd9db7b0998d86172b3
detector-hints.config        f87c0c7da3a42d2cfafb95619136d068cf02d2d2d3bcb980f819d85270a3fac6
dynamic-theme-fixes.config   d212e12c07935d1f86a3accd22fb2275233ed88bc5538204222fd44f6843b5b2
```

The `darkreader` dependency is locked directly to the exact Git tag because npm did not publish version 4.9.129. The tag’s own package manifest declares `"version": "4.9.129"`.
