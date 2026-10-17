// Records what 0.1.0 does on each saved page, in tests/fixtures/<site>/<page>.expected.json.
// Usage: npm run record-expected [-- <site>/<page> ...]   (no arguments: all pages)
import { writeFileSync } from 'node:fs';
import { prepareLegacy } from '../tests/e2e/global-setup';
import { expectedPath, launch, listFixtures, openFixture, record } from '../tests/e2e/harness';

process.env['NSP_EXT'] = 'legacy';

const wanted = process.argv.slice(2);
const all = listFixtures();
const fixtures = wanted.length ? all.filter((f) => wanted.includes(`${f.site}/${f.name}`)) : all;
const missing = wanted.filter((w) => !all.some((f) => `${f.site}/${f.name}` === w));
if (missing.length) {
  console.error(`Pages not found (.html and .meta.json required): ${missing.join(', ')}`);
  process.exit(1);
}

prepareLegacy();
for (const { site, name } of fixtures) {
  const { context, sw } = await launch();
  try {
    const page = await openFixture(context, site, name);
    const rec = await record(page, sw);
    writeFileSync(expectedPath(site, name), JSON.stringify(rec, null, 2) + '\n');
    console.log(`${site}/${name}: ${rec.hits.length} hits, badge "${rec.badge}", mode ${rec.mode}`);
  } finally {
    await context.close();
  }
}
