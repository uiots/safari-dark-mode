# Safari 26 acceptance report

## Environment

- Date: 2026-08-31
- macOS host timezone: Australia/Melbourne
- Safari: 26.6.2 (21624.5.1.11.3), reported by `safaridriver --version`
- Build under test: `dist/extension/`

## Automated gate

Passed on 2026-08-31 with `npm run check`:

- ESLint: pass, zero findings
- TypeScript `tsc --noEmit`: pass in strict mode
- Production esbuild: pass
- Vitest: 7 files passed, 36 tests passed

## Live acceptance

Not yet executed. A result is not recorded as passing until the unpacked extension is loaded through Safari's temporary-extension workflow and each item below is exercised.

| Check | Result | Evidence |
|---|---|---|
| All Websites access | Not run | — |
| Missing-access state | Not run | — |
| Wikipedia | Not run | — |
| GitHub | Not run | — |
| Google Search | Not run | — |
| Reddit | Not run | — |
| Public news site | Not run | — |
| Native-dark site skipped in Automatic | Not run | — |
| Force dark overrides detection | Not run | — |
| Off is exact-host only | Not run | — |
| Sliders update open pages | Not run | — |
| Settings survive Safari restart | Not run | — |
| Failed resource is recoverable | Not run | — |
| Restricted page reports honest status | Not run | — |

## Known limitations

- The extension intentionally excludes file URLs, PDFs, iPhone/iPad, Safari below 26, sync, schedules, import/export, telemetry, signing, and App Store packaging.
- Live compatibility conclusions are withheld until the table above is completed in Safari.
