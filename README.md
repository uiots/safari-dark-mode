<div align="center">

<img src="src/static/icon.svg" alt="Safari Dark Mode icon" width="96" height="96">

# Safari Dark Mode

A focused Safari 26 extension that darkens light websites while preserving native dark themes.

![Safari 26+](https://img.shields.io/badge/Safari-26%2B-006CFF?logo=safari&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tests](https://img.shields.io/badge/tests-36%20passing-brightgreen)

**English** · [简体中文](README.zh-CN.md)

</div>

Safari Dark Mode uses Dark Reader's dynamic rendering engine to transform ordinary HTTP(S) pages. Automatic mode detects native dark themes and leaves them untouched, while per-site controls let you disable or force dark mode when needed.

<p align="center">
  This is built because every night I experience this:
  <br><br>
  <img src="https://i.imgflip.com/5ajbfn.png" alt="meme" width="200" height="200">
</p>

## Features

- Automatic native-dark-theme detection
- Automatic, Off, and Force dark modes for each exact hostname
- Brightness, contrast, and sepia controls
- Dynamic updates for single-page applications and theme changes
- Cross-origin stylesheet support through a restricted resource proxy
- Local-only settings with no analytics or telemetry
- Dark Reader v4.9.129 engine and upstream site fixes

## Requirements

- macOS with Safari 26 or later
- Node.js 22 or later and npm
- Safari's temporary web-extension loading workflow enabled

> [!NOTE]
> This is an unpacked development extension. It does not include an Xcode wrapper, signing, or App Store packaging, and may need to be reloaded after Safari exits.

## Get started

```sh
git clone https://github.com/mikotokuroko/safari-dark-mode.git
cd safari-dark-mode
npm install
npm run check
```

The built extension is written to `dist/extension/`.

## Load in Safari

1. Enable Safari's **Develop** menu if it is hidden.
2. Allow unsigned extensions and open Safari's temporary web-extension loader.
3. Select `dist/extension/manifest.json`, or `dist/extension/` when Safari asks for a folder.
4. Open **Safari → Settings → Websites → Extensions → Safari Dark Mode**.
5. Choose **Allow** for **All Websites**.
6. Use the toolbar button to select Automatic, Off, or Force dark and adjust the theme controls.

> [!IMPORTANT]
> Reload the temporary extension after rebuilding. Safari can assign it a new identity and reset website access, so re-check the **All Websites** permission when access is unavailable.

## Development

| Command | Purpose |
| --- | --- |
| `npm run build` | Build the unpacked extension |
| `npm run check` | Run lint, type checking, build, and all tests |
| `npm test` | Run the Vitest suite |
| `npm run fixtures` | Serve local compatibility fixtures on ports 4173 and 4174 |

The committed lockfile pins Dark Reader tag v4.9.129 to commit `c2a707302a39b8047543712e9c582bac07835d34`.

## Project structure

```text
src/background/   Settings, messages, and restricted resource fetching
src/content/      Detection, policy, Dark Reader integration, and reevaluation
src/popup/        Toolbar controls
src/onboarding/   First-run website-access guidance
src/shared/       Contracts, validation, policy, and browser helpers
src/vendor/       Pinned Dark Reader engine and site configuration
fixtures/         Local light, dark, dynamic, frame, and resource test pages
tests/            Unit, contract, fixture, proxy, and manifest tests
qa/               Safari acceptance report
```

## Privacy and security

The extension requests `storage`, `tabs`, and HTTP(S) website access. Settings remain in Safari's local extension storage. The resource proxy accepts only HTTP(S) GET requests, sends no credentials or referrer, enforces a 10-second timeout, and rejects responses larger than 8 MiB.

There is no analytics, telemetry, remote code, native messaging, external messaging, local-file access, or PDF support.

## Current scope

Version 0.1.0 targets macOS Safari 26+. It intentionally excludes iPhone and iPad, older Safari versions, PDFs, local files, scheduling, sync, import/export, keyboard shortcuts, signing, TestFlight, and App Store distribution.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for Dark Reader provenance and [qa/SAFARI_QA.md](qa/SAFARI_QA.md) for automated and live-browser verification status.
