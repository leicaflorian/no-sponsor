// Records what the extension does on each saved page, in tests/fixtures/<site>/<page>.expected.json.
// Usage: npm run record-expected [-- [--build] <site>/<page> ...]   (no pages: all pages)
// By default it records 0.1.0 (tag v0.1.0). With --build it records the current build (run `npm run build`
// first) and writes `since` with the package version: use it only for an intended change of behaviour.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepareLegacy } from '../tests/e2e/global-setup';
import { ROOT, expectedPath, extensionPath, launch, listFixtures, openFixture, record } from '../tests/e2e/harness';

const fromBuild = process.argv.includes('--build');
if (!fromBuild) process.env['NSP_EXT'] = 'legacy';
const since = fromBuild
  ? (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version
  : undefined;
if (fromBuild && !existsSync(extensionPath())) {
  console.error('No build found: run `npm run build` first.');
  process.exit(1);
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const all = listFixtures();
const fixtures = wanted.length ? all.filter((f) => wanted.includes(`${f.site}/${f.name}`)) : all;
const missing = wanted.filter((w) => !all.some((f) => `${f.site}/${f.name}` === w));
if (missing.length) {
  console.error(`Pages not found (.html and .meta.json required): ${missing.join(', ')}`);
  process.exit(1);
}

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
