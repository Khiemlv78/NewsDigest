import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'NewsDigest Reddit Scraper',
    description: 'Scrape Reddit listings and posts from old.reddit.com into NewsDigest.',
    permissions: ['tabs', 'activeTab', 'storage', 'alarms'],
    host_permissions: [
      '*://old.reddit.com/*',
      'http://localhost/*',
      'https://*.workers.dev/*',
      'https://*.pages.dev/*'
    ],
    icons: {
      "16": "favicon.png",
      "32": "favicon.png",
      "48": "favicon.png",
      "96": "icon-192.png",
      "128": "icon-192.png",
      "256": "icon-256.png",
      "512": "icon-512.png"
    },
    action: {
      default_icon: {
        "16": "favicon.png",
        "32": "favicon.png",
        "48": "favicon.png",
        "96": "icon-192.png",
        "128": "icon-192.png"
      }
    }
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
});
