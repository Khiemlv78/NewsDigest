import { browser } from 'wxt/browser';
import type { ContentScriptMessage } from '../lib/types';
import { scrapeRedditListing, scrapeRedditPost } from '../lib/scraper';

/** Random integer in [min, max] inclusive */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Sleep for ms milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Simulate human-like scrolling on the page.
 * Scrolls down in variable increments with random pauses,
 * then sometimes scrolls back up a bit — like a real user skimming.
 */
async function simulateScroll(): Promise<void> {
  const viewportHeight = window.innerHeight;
  const docHeight = document.documentElement.scrollHeight;
  // Don't scroll beyond what's available
  const maxScroll = Math.min(docHeight - viewportHeight, viewportHeight * 3);

  if (maxScroll <= 0) return;

  // Decide how far to scroll (30-80% of available content)
  const targetScroll = randInt(Math.floor(maxScroll * 0.3), Math.floor(maxScroll * 0.8));
  let currentScroll = 0;

  // Scroll down in 3-6 steps (variable chunk sizes)
  const steps = randInt(3, 6);
  for (let i = 0; i < steps && currentScroll < targetScroll; i++) {
    // Each step scrolls a variable amount (not perfectly even)
    const remaining = targetScroll - currentScroll;
    const fraction = (1 / (steps - i)) * (0.6 + Math.random() * 0.8);
    const delta = Math.min(remaining, Math.floor(remaining * fraction));
    currentScroll += delta;

    window.scrollBy({ top: delta, behavior: 'smooth' });
    // Pause between scrolls: 300-900ms (humans don't scroll at fixed intervals)
    await sleep(randInt(300, 900));
  }

  // Sometimes scroll back up a bit (40% chance — like re-reading something)
  if (Math.random() < 0.4) {
    await sleep(randInt(200, 600));
    const scrollBack = randInt(100, Math.floor(currentScroll * 0.3));
    window.scrollBy({ top: -scrollBack, behavior: 'smooth' });
    await sleep(randInt(200, 500));
  }
}

export default defineContentScript({
  matches: ['*://old.reddit.com/*'],
  main() {
    browser.runtime.onMessage.addListener((message: ContentScriptMessage) => {
      if (message?.action === 'ping') return Promise.resolve({ ok: true });
      if (message?.action === 'scrape-listing') return Promise.resolve({ ok: true, articles: scrapeRedditListing() });
      if (message?.action === 'scrape-post') return Promise.resolve({ ok: true, ...scrapeRedditPost() });
      if (message?.action === 'simulate-scroll') return simulateScroll().then(() => ({ ok: true }));
      return undefined;
    });
  },
});
