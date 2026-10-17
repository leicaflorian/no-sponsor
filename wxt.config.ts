import { defineConfig } from 'wxt';

// Manifest equivalent to 0.1.0's: the other fields (content script,
// background, popup, icons) are derived by WXT from the entrypoints and public/.
export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'NoSponsor',
    description:
      'Evidenzia, comprime o nasconde i contenuti sponsorizzati su Google, Amazon, Subito, eBay e altri siti.',
    permissions: ['storage'],
    action: {
      default_title: 'NoSponsor',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
  },
});
