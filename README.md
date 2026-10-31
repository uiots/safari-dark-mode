<div align="center">

<img src="src/static/icon.svg" alt="Safari Dark Mode icon" width="96" height="96">

# Safari Dark Mode

A focused Safari 26 extension that keeps websites dark by default.

![Safari 26+](https://img.shields.io/badge/Safari-26%2B-006CFF?logo=safari&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Tests](https://img.shields.io/badge/tests-53%20passing-brightgreen)

**English** · [简体中文](README.zh-CN.md)

</div>

Safari Dark Mode uses Dark Reader's dynamic rendering engine to transform ordinary HTTP(S) pages. Force dark is the default, independent of system appearance. Per-site controls let you opt into Automatic detection or turn dark mode off. Settings apply without refreshing the page.

<p align="center">
  This is built because every night I experience this:
  <br><br>
  <img src="https://i.imgflip.com/5ajbfn.png" alt="meme" width="200" height="200">
</p>

## Features

- Always-on dark mode by default, with optional native-dark-theme detection
- Automatic, Off, and Force dark modes for each exact hostname
- Brightness, contrast, and sepia controls
- Dynamic updates for single-page applications and theme changes
- Hover preview of a larger image original; move the pointer away, press Escape, or scroll to dismiss
- Cross-origin stylesheet support through a restricted resource proxy
- Local-only settings with no analytics or telemetry
- Dark Reader v4.9.129 engine and upstream site fixes

## Requirements

- macOS with Safari 26 or later
- Node.js 22 or later and npm
- Safari's temporary web-extension loading workflow enabled
- Xcode 26 or later for a signed, persistent installation

## Get started

```sh
git clone https://github.com/mikotokuroko/safari-dark-mode.git
cd safari-dark-mode
npm install
npm run check
```

The built extension is written to `dist/extension/`.

## Install in Safari

### Temporary development install

1. Enable Safari's **Develop** menu if it is hidden.
2. Allow unsigned extensions and open Safari's temporary web-extension loader.
3. Select `dist/extension/manifest.json`, or `dist/extension/` when Safari asks for a folder.
4. Open **Safari → Settings → Websites → Extensions → Safari Dark Mode**.
5. Choose **Allow** for **All Websites**.
6. Use the toolbar button to select Automatic, Off, or Force dark and adjust the theme controls.

> [!IMPORTANT]
> Reload the temporary extension after rebuilding. Safari can assign it a new identity and reset website access, so re-check the **All Websites** permission when access is unavailable.

### Signed macOS app

Safari clears **Allow unsigned extensions** when it quits. To keep the extension installed, package it as a signed macOS Safari Web Extension app:

1. Install and open full Xcode, then select its developer tools:

   ```sh
   sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -runFirstLaunch
   ```

2. Build the extension and generate the Xcode project:

   ```sh
   npm run build

   xcrun safari-web-extension-packager \
     "$PWD/dist/extension" \
     --project-location "$HOME/Documents/Safari-Dark-Mode-Xcode" \
     --app-name "Safari Dark Mode" \
     --bundle-identifier "com.mikotokuroko.safaridarkmode" \
     --swift \
     --macos-only \
     --copy-resources
   ```

3. In Xcode, click the blue project icon. Under **TARGETS**, configure both **Safari Dark Mode** (the containing app) and **Safari Dark Mode Extension** (the browser extension) in **Signing & Capabilities** with the same development team.
4. Set the containing app's bundle identifier to `com.mikotokuroko.safaridarkmode`. Leave the extension identifier as `com.mikotokuroko.safaridarkmode.Extension`. The extension identifier must begin with the complete app identifier.
5. Select **Product → Clean Build Folder**, choose the **Safari Dark Mode** app scheme and **My Mac**, then press **Run**.
6. In Safari, enable the extension and grant it access to **All Websites**.

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

Version 0.1.0 targets macOS Safari 26+. It intentionally excludes iPhone and iPad, older Safari versions, PDFs, local files, scheduling, sync, import/export, keyboard shortcuts, a pre-generated Xcode wrapper, TestFlight, and App Store distribution.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for Dark Reader provenance and [qa/SAFARI_QA.md](qa/SAFARI_QA.md) for automated and live-browser verification status.
