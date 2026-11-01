import {readdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export function bundleVersionFromSemver(version) {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map((part) => {
    const value = Number(part);
    return Number.isFinite(value) ? value : 0;
  });
  return String(major * 10000 + minor * 100 + patch);
}

function escapeXml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function stampInfoPlist(xml, shortVersion, bundleVersion) {
  const short = escapeXml(shortVersion);
  const build = escapeXml(bundleVersion);
  let next = replacePlistString(xml, 'CFBundleShortVersionString', short);
  next = replacePlistString(next, 'CFBundleVersion', build);
  return next;
}

function replacePlistString(xml, key, value) {
  const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)[\\s\\S]*?(</string>)`);
  if (pattern.test(xml)) {
    return xml.replace(pattern, `$1${value}$2`);
  }
  return xml.replace('</dict>', `<key>${key}</key>\n\t<string>${value}</string>\n</dict>`);
}

async function infoPlists(directory) {
  const found = [];
  const entries = await readdir(directory, {withFileTypes: true});
  for (const entry of entries) {
    if (entry.name === 'xcuserdata' || entry.name === 'Pods') {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...await infoPlists(path));
    } else if (entry.name === 'Info.plist') {
      found.push(path);
    }
  }
  return found;
}

async function main() {
  if (process.argv[2] === '--self-test') {
    console.log(bundleVersionFromSemver('0.1.1'));
    console.log(stampInfoPlist(`<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
\t<key>CFBundleShortVersionString</key>
\t<string>1.0</string>
\t<key>CFBundleVersion</key>
\t<string>1</string>
</dict></plist>
`, '0.1.1', '101'));
    return;
  }
  const project = process.argv[2];
  if (project === undefined || project === '') {
    console.error('Usage: node scripts/stamp-safari-bundle.mjs <xcode-project-directory>');
    process.exitCode = 1;
    return;
  }
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const shortVersion = pkg.version;
  const bundleVersion = bundleVersionFromSemver(shortVersion);
  const plists = await infoPlists(project);
  if (plists.length === 0) {
    throw new Error(`No Info.plist files found under ${project}`);
  }
  for (const path of plists) {
    const xml = await readFile(path, 'utf8');
    await writeFile(path, stampInfoPlist(xml, shortVersion, bundleVersion));
    console.log(`${path} → ${shortVersion} (${bundleVersion})`);
  }
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('stamp-safari-bundle.mjs')) {
  await main();
}
