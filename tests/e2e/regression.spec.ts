import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { expectedPath, launch, listFixtures, openFixture, record, type Recording } from './harness';

// One test for each saved page that has its .expected.json (recorded from 0.1.0 with npm run record-expected).
const recorded = listFixtures().filter(({ site, name }) => existsSync(expectedPath(site, name)));

// Guard: the suite must not silently become empty (for example if the fixtures folder changes).
test('at least 5 pages with expected results', () => {
  expect(recorded.length).toBeGreaterThanOrEqual(5);
});

for (const { site, name } of recorded) {
  const file = expectedPath(site, name);

  test(`${site}/${name} matches 0.1.0`, async () => {
    const expected = JSON.parse(readFileSync(file, 'utf8')) as Recording;
    const { context, sw } = await launch();
    try {
      const page = await openFixture(context, site, name);
      expect(await record(page, sw)).toEqual(expected);
    } finally {
      await context.close();
    }
  });
}
