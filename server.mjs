import express from 'express';
import { chromium } from 'playwright-chromium';
import * as prerender from './ssr.mjs';
import { URL } from 'url';

const app = express();

// https://playwright.dev/docs/next/api/class-browsertype
const browserServer = await chromium.launchServer({ args: ["--ignore-certificate-errors"] });
const wsEndpoint = await browserServer.wsEndpoint();
console.info(`wsEndpoint ${wsEndpoint}`)

const url = `http://localhost/index.html`;
const waitForSelector = '#posts'; // playwrightでは、現状は不要。

// HTMLをプレレンダリングする
app.get('/', async (req, res, next) => {
  const {html, ttRenderMs} = await prerender.ssr(url, wsEndpoint, waitForSelector);
  // Add Server-Timing! See https://w3c.github.io/server-timing/.
  res.set('Server-Timing', `Prerender;dur=${ttRenderMs};desc="Headless render time (ms)"`);
  return res.status(200).send(html); // Serve prerendered page as response.
});

// cronジョブ等で、キャッシュをUpdateする
app.get('/cron/update_cache', async (req, res) => {
  if (!req.get('X-Appengine-Cron')) {
    return res.status(403).send('Sorry, cron handler can only be run as admin.');
  }
  const homepage = new URL(url);
  // Re-render main page and a few pages back.
  prerender.clearCache();
  await prerender.ssr(homepage.href, wsEndpoint, waitForSelector);
  await prerender.ssr(`${homepage}?year=2018`, wsEndpoint, waitForSelector);
  await prerender.ssr(`${homepage}?year=2017`, wsEndpoint, waitForSelector);
  await prerender.ssr(`${homepage}?year=2016`, wsEndpoint, waitForSelector);
  res.status(200).send('Render cache updated!');
});

app.listen(58080, () => console.log('Server started http://localhost:58080/ Press Ctrl+C to quit'));

process.on('SIGTERM', () => {
  server.close(async () => {
    if (!browserServer) {
      // Close browser instance.
      await browserServer.close();
    }
    console.log('Process terminated.')
  })
})
