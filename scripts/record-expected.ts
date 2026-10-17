// Records what the extension does on each saved page, in tests/fixtures/<site>/<page>.expected.json.
// Usage: npm run record-expected [-- <site>/<page> ...]          records 0.1.0 (tag v0.1.0); no pages: all pages
//        npm run record-expected -- --build <site>/<page> ...    records the current build (run `npm run build`
//                                                                first) and writes `since` with its version
// Use --build only for an intended change of behaviour, and name the pages it applies to. A plain run never
// overwrites a page whose expected result has `since`: re-record those with --build.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepareLegacy } from '../tests/e2e/global-setup';
import { ROOT, expectedPath, launch, listFixtures, openFixture, record, type Expected } from '../tests/e2e/harness';

const args = process.argv.slice(2);
const unknown = args.filter((a) => a.startsWith('--') && a !== '--build');
if (unknown.length) fail(`Unknown option: ${unknown.join(', ')}`);
const fromBuild = args.includes('--build');
const wanted = args.filter((a) => !a.startsWith('--'));
if (fromBuild && !wanted.length) fail('--build needs the pages to record (<site>/<page> ...).');

let since: string | undefined;
if (fromBuild) {
  delete process.env['NSP_EXT'];
  const manifest = join(ROOT, '.output/chrome-mv3/manifest.json');
  if (!existsSync(manifest)) fail('No build found: run `npm run build` first.');
  since = readJson<{ version: string }>(manifest).version;
  const pkg = readJson<{ version: string }>(join(ROOT, 'package.json')).version;
  if (since !== pkg) fail(`The build is ${since} but package.json says ${pkg}: run \`npm run build\` again.`);
} else {
  process.env['NSP_EXT'] = 'legacy';
}

const all = listFixtures();
const missing = wanted.filter((w) => !all.some((f) => `${f.site}/${f.name}` === w));
if (missing.length) fail(`Pages not found (.html and .meta.json required): ${missing.join(', ')}`);
const fixtures = (wanted.length ? all.filter((f) => wanted.includes(`${f.site}/${f.name}`)) : all).filter(
  ({ site, name }) => {
    if (fromBuild) return true;
    const file = expectedPath(site, name);
    const current = existsSync(file) ? readJson<Expected>(file).since : undefined;
    if (current) console.warn(`${site}/${name}: skipped, its expected result is from ${current} (use --build).`);
    return !current;
  },
);

if (!fromBuild) prepareLegacy();
for (const { site, name } of fixtures) {
  const { context, sw } = await launch();
  try {
    const page = await openFixture(context, site, name);
    const rec = await record(page, sw);
    writeFileSync(expectedPath(site, name), JSON.stringify(since ? { since, ...rec } : rec, null, 2) + '\n');
    console.log(`${site}/${name}: ${rec.hits.length} hits, badge "${rec.badge}", mode ${rec.mode}`);
  } finally {
    await context.close();
  }
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, 'utf8')) as T;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
