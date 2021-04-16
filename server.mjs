import express from 'express';
import puppeteer from 'puppeteer';
import * as prerender from './ssr.mjs';
import { URL } from 'url';

let browserWSEndpoint = null;
const app = express();
// const url = `http://localhost/index.html`;
const url = `https://ecs.toranoana.jp/tora/ec/`;
// const waitForSelector = '#toracotd';
const waitForSelector = '#posts';
// app.use(express.static('public'));
// HTMLをプレレンダリングする
app.get('/', async (req, res, next) => {
  if (!browserWSEndpoint) {
    const browser = await puppeteer.launch();
    browserWSEndpoint = await browser.wsEndpoint();
  }
  console.log(url)
  const {html, ttRenderMs} = await prerender.ssr(url, browserWSEndpoint, waitForSelector);
  // Add Server-Timing! See https://w3c.github.io/server-timing/.
  res.set('Server-Timing', `Prerender;dur=${ttRenderMs};desc="Headless render time (ms)"`);
  return res.status(200).send(html); // Serve prerendered page as response.
});

// cronジョブ等で、キャッシュをUpdateする
app.get('/cron/update_cache', async (req, res) => {
  if (!browserWSEndpoint) {
    const browser = await puppeteer.launch();
    browserWSEndpoint = await browser.wsEndpoint();
  }
  if (!req.get('X-Appengine-Cron')) {
    return res.status(403).send('Sorry, cron handler can only be run as admin.');
  }
  const homepage = new URL(url);

  // Re-render main page and a few pages back.
  prerender.clearCache();
  await prerender.ssr(homepage.href, browserWSEndpoint, waitForSelector);
  await prerender.ssr(`${homepage}?year=2018`, browserWSEndpoint, waitForSelector);
  await prerender.ssr(`${homepage}?year=2017`, browserWSEndpoint, waitForSelector);
  await prerender.ssr(`${homepage}?year=2016`, browserWSEndpoint, waitForSelector);
  await browser.close();

  res.status(200).send('Render cache updated!');
});

app.listen(8080, () => console.log('Server started http://localhost:8080/ Press Ctrl+C to quit'));
