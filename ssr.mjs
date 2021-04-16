import puppeteer from 'puppeteer';
import { URL } from 'url';

// In-memory cache of rendered pages. Note: this will be cleared whenever the
// server process stops. If you need true persistence, use something like
// Google Cloud Storage (https://firebase.google.com/docs/storage/web/start).
const RENDER_CACHE = new Map();

async function ssr(url, browserWSEndpoint, waitForSelector) {
  if (RENDER_CACHE.has(url)) {
    return {html: RENDER_CACHE.get(url), ttRenderMs: 0};
  }
  const start = Date.now();
  const browser = await puppeteer.connect({browserWSEndpoint});
  let page = null;
  let html = null;
  try {
    page = await browser.newPage();
    const stylesheetContents = {};
    // 1. Intercept network requests.
    await page.setRequestInterception(true);
    page.on('request', req => {
      // 2. Ignore requests for resources that don't produce DOM
      // (images, stylesheets, media).
      const allowlist = ['document', 'script', 'xhr', 'fetch', 'stylesheet'];
      if (!allowlist.includes(req.resourceType())) {
        return req.abort();
      }
      // Don't load Google Analytics lib requests so pageviews aren't 2x.
      const blocklist = ['www.google-analytics.com', '/gtag/js', 'ga.js', 'analytics.js'];
      if (blocklist.find(regex => req.url().match(regex))) {
        return req.abort();
      }
      // 3. Pass through all other requests.
      req.continue();
    });
    // 1. Stash the responses of local stylesheets.
    page.on('response', async resp => {
      const responseUrl = resp.url();
      const sameOrigin = new URL(responseUrl).origin === new URL(url).origin;
      const isStylesheet = resp.request().resourceType() === 'stylesheet';
      console.log(responseUrl, sameOrigin, isStylesheet);
      if (sameOrigin && isStylesheet) {
        // TODO: ここでstyleの縮小(min化)したり、不要なstyleの削除ができないかな？
        stylesheetContents[responseUrl] = await resp.text();
        console.log(stylesheetContents[responseUrl]);
      }
    });
    try {
      // networkidle0 waits for the network to be idle (no requests for 500ms).
      // The page's JS has likely produced markup by this point, but wait longer
      // if your site lazy loads, etc.
      // 2. Load page as normal, waiting for network requests to be idle.
      const renderUrl = new URL(url);
      renderUrl.searchParams.set('headless', ''); // headlessで描画されていることを教える、もしくは、Page.evaluateOnNewDocument() を使う。
      await page.goto(url, {waitUntil: 'networkidle0'});
      // 仮で入れる
      // await page.waitForNavigation({waitUntil: ['load', 'networkidle2']});
      await page.waitForSelector(waitForSelector); // ensure #posts exists in the DOM.
    } catch (err) {
      console.error(err);
      // 一時的にコメントアウトもあり
      throw new Error('page.goto/waitForSelector timed out.');
    }
    // 3. Inline the CSS.
    // Replace stylesheets in the page with their equivalent <style>.
    await page.$$eval('link[rel="stylesheet"]', (links, content) => {
      links.forEach(link => {
        const cssText = content[link.href];
        if (cssText) {
          const style = document.createElement('style');
          style.textContent = cssText;
          link.replaceWith(style);
        }
      });
    }, stylesheetContents);
    html = await page.content(); // serialized HTML of page DOM.
  } finally {
    if (page != null) await page.close();
  }
  const ttRenderMs = Date.now() - start;
  console.info(`Headless rendered page in: ${ttRenderMs}ms`);

  RENDER_CACHE.set(url, html); // cache rendered page.

  return {html, ttRenderMs};
}

function clearCache() {
  RENDER_CACHE.clear();
}

export {ssr, clearCache};