import express from 'express'
import { chromium } from 'playwright-chromium'
import { URL } from 'url'
import * as prerender from './ssr.mjs'
import { proxy } from './proxy.mjs'

const app = express()
const router = express.Router()

// https://playwright.dev/docs/next/api/class-browsertype
const browserServer = await chromium.launchServer({ args: ['--ignore-certificate-errors', '--lang=ja,en-US,en'] })
const wsEndpoint = await browserServer.wsEndpoint()
console.info(`wsEndpoint ${wsEndpoint}`)

const url = `https://localhost`
const waitForSelector = '#posts' // playwrightでは、現状は不要。

// プレレンダリング対象の相対URLを設定する
const prerenderUrlList = [
  '/',
  '/index.html',
]

// プロキシ対象の相対URLを設定する
const proxyUrlList = []

const rawBodySaver = function(req, res, buf, encoding) {
  if (buf && buf.length) {
    req.rawBody = buf.toString(encoding || 'utf8')
  }
}

app.use(express.json({verify: rawBodySaver}))
app.use(express.urlencoded({verify: rawBodySaver, extended: true}))
app.use(express.raw({verify: rawBodySaver, type: '*/*'}))

// プレレンダリングするHTMLを設定する
prerenderUrlList.forEach(prerenderUrl => {
  router
    .get(prerenderUrl, async (req, res, next) => {
      console.log('----- prerender -----')
      if (prerender.isCache(url + prerenderUrl)) {
        const { html, ttRenderMs } = await prerender.ssr(url + prerenderUrl, wsEndpoint, waitForSelector)
        // Add Server-Timing! See https://w3c.github.io/server-timing/.
        res.set('Server-Timing', `Prerender;dur=${ttRenderMs};desc="Headless render time (ms)"`)
        return res.status(200).send(html) // Serve prerendered page as response.
      } else {
        proxy(req, res, next, url + prerenderUrl)
      }
      onsole.log('----- prerender -----')
    })
})

proxyUrlList.forEach(proxyUrl => {
  router.all(proxyUrl, function (req, res, next) {
    console.log('----- proxy -----')
    proxy(req, res, next, url + req.path) // originalUrl
    console.log('----- proxy -----')
  })
})

// cronジョブ等で、キャッシュをUpdateする
router
  .get('/cron/update_cache', async (req, res) => {
    if (!req.get('X-Appengine-Cron')) {
      return res.status(403).send('Sorry, cron handler can only be run as admin.')
    }
    const homepage = new URL(url)
    // Re-render main page and a few pages back.
    prerender.clearCache()
    await prerender.ssr(homepage.href, wsEndpoint, waitForSelector)
    await prerender.ssr(`${homepage}?year=2018`, wsEndpoint, waitForSelector)
    await prerender.ssr(`${homepage}?year=2017`, wsEndpoint, waitForSelector)
    await prerender.ssr(`${homepage}?year=2016`, wsEndpoint, waitForSelector)
    res.status(200).send('Render cache updated!')
  })

app.use('/', router)
app.listen(58080, () => console.log('Server started http://localhost:58080/ Press Ctrl+C to quit'))

process.on('SIGTERM', () => {
  server.close(async () => {
    if (!browserServer) {
      // Close browser instance.
      await browserServer.close()
    }
    console.log('Process terminated.')
  })
})
