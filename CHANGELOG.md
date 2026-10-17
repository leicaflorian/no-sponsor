# Changelog

All notable changes to NoSponsor. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the version is the one in `package.json` and the manifest.

## [1.0.11] - 2026-10-17

### Added

- Popup: a "Report a problem" link that opens a new GitHub issue prefilled with the extension version, the page host (never the full URL), the detector, the number of items found and the settings. Nothing is sent until the user submits the issue.

## [1.0.10] - 2026-10-17

### Added

- Italian and English UI, following the browser language, with English for every other language. Popup, collapsed bar, YouTube ad veil and store description are translated.

## [1.0.9] - 2026-10-17

### Changed

- YouTube: video ads play at 16x, muted and veiled, and the previous speed and volume come back when the ad ends.

## [1.0.8] - 2026-10-17

### Removed

- YouTube: no more clicking Skip, since YouTube ignores the click.

## [1.0.7] - 2026-10-17

### Changed

- Larger toolbar icon, easier to see.

## [1.0.6] - 2026-10-17

### Added

- YouTube: click Skip as soon as it shows.

## [1.0.5] - 2026-10-17

### Fixed

- YouTube: video ads stay muted when the player turns the audio back on.

## [1.0.4] - 2026-10-17

### Fixed

- YouTube: generic detection no longer takes the whole player for a sponsored item, which hid the video and kept it hidden after the ad. Video ads are covered by a veil instead.

## [1.0.3] - 2026-10-17

### Fixed

- Empty ad slots are no longer marked.

## [1.0.2] - 2026-10-17

### Fixed

- Highlight mode: the border moves inside the item when a neighbour is too close, so it is not cut off.

## [1.0.1] - 2026-10-17

### Fixed

- Amazon: sponsored cards on the home page and in widget cards are marked.

## [1.0.0] - 2026-10-17

### Changed

- Rewritten with WXT and TypeScript, with unit tests, end-to-end tests on saved pages and CI. Same behaviour as 0.1.0.

## [0.1.0]

### Added

- First version: highlights, collapses or hides sponsored content on Google, Amazon, Subito and eBay, with generic detection of "Sponsored" labels on other sites, a per-site switch and the count on the toolbar icon.

[1.0.11]: https://github.com/leicaflorian/no-sponsor/releases/tag/v1.0.11
