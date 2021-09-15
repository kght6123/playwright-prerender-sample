// https://playwright.dev/docs/next/api/class-browsertype
import { chromium } from 'playwright-chromium'
import { URL } from 'url'

// In-memory cache of rendered pages. Note: this will be cleared whenever the
// server process stops. If you need true persistence, use something like
// Google Cloud Storage (https://firebase.google.com/docs/storage/web/start).
const RENDER_CACHE = new Map()

async function ssr(url, wsEndpoint, waitForSelector) {
  if (RENDER_CACHE.has(url)) {
    return { html: RENDER_CACHE.get(url), ttRenderMs: 0 }
  }
  console.log(`1`)
  const start = Date.now()
  // https://playwright.dev/docs/next/api/class-browser
  const browser = await chromium.connect({ wsEndpoint })
  let page = null
  let html = null
  try {
    console.log(`2`)
    page = await browser.newPage()
    // 1. Intercept network requests.
    // await page.setRequestInterception(true);
    // Don't load Google Analytics lib requests so pageviews aren't 2x.
    await page.route(
      (url) => {
        const blocklist = [
          'www.google-analytics.com',
          '/gtag/js',
          'ga.js',
          'analytics.js',
        ]
        console.log(`url=${url}`)
        if (blocklist.find((regex) => url.toString().match(regex))) {
          console.log(`yes`)
          return true
        } else {
          console.log(`no`)
          return false
        }
      },
      (route) => route.abort()
    )
    // 2. Ignore requests for resources that don't produce DOM
    // (images, stylesheets, media).
    await page.route(
      () => true,
      (route, req) => {
        const allowlist = ['document', 'script', 'xhr', 'fetch', 'stylesheet']
        if (!allowlist.includes(req.resourceType())) {
          route.abort()
        } else {
          // 3. Pass through all other requests.
          route.continue()
        }
      }
    )
    console.log(`3`)
    const stylesheetContents = {}
    const scriptContents = {}
    // 1. Stash the responses of local stylesheets.
    page.on('response', async (resp) => {
      const responseUrl = resp.url()
      const sameOrigin = new URL(responseUrl).origin === new URL(url).origin
      const isStylesheet = resp.request().resourceType() === 'stylesheet'
      const isScript = resp.request().resourceType() === 'script'
      console.log(
        responseUrl,
        resp.request().resourceType(),
        sameOrigin,
        isStylesheet,
        isScript
      )
      if (sameOrigin && isStylesheet) {
        // TODO: ここでstyleの縮小(min化)したり、不要なstyleの削除ができないかな？
        stylesheetContents[responseUrl] = await resp.text()
        // console.log(stylesheetContents[responseUrl]);
      }
      if (sameOrigin && isScript) {
        // TODO: ここでscriptの縮小(min化)したり、不要なscriptの削除ができないかな？
        scriptContents[responseUrl] = await resp.text()
      }
    })
    console.log(`4`)
    try {
      // networkidle0 waits for the network to be idle (no requests for 500ms).
      // The page's JS has likely produced markup by this point, but wait longer
      // if your site lazy loads, etc.
      // 2. Load page as normal, waiting for network requests to be idle.
      const renderUrl = new URL(url)
      renderUrl.searchParams.set('headless', '') // headlessで描画されていることを教える、もしくは、Page.evaluateOnNewDocument() を使う。
      await page.goto(url)
      console.log(`5`)
      // https://playwright.dev/docs/next/api/class-page#pagewaitforloadstatestate-options
      await page.waitForLoadState('networkidle')
      console.log(`6`)
    } catch (err) {
      console.error(err)
      // 一時的にコメントアウトもあり
      throw new Error('page.goto/waitForSelector timed out.')
    }
    // 3. Inline the CSS.
    // Replace stylesheets in the page with their equivalent <style>.
    await page.$$eval(
      'link[rel="stylesheet"]',
      (links, content) => {
        links.forEach((link) => {
          const cssText = content[link.href]
          if (cssText) {
            const style = document.createElement('style')
            style.textContent = cssText
            link.replaceWith(style)
          }
        })
      },
      stylesheetContents
    )
    // 4. Inline the Script
    await page.$$eval(
      'script[src]',
      (scripts, content) => {
        scripts.forEach((script) => {
          const jsText = content[script.src]
          if (jsText) {
            const scriptEl = document.createElement('script')
            scriptEl.textContent = jsText
            // FIXME: これをやるとscriptが動き始めるので、アクセスできなくてエラーになる
            // script.replaceWith(scriptEl);
          }
        })
      },
      scriptContents
    )
    console.log(`7`)
    html = await page.content() // serialized HTML of page DOM.
    console.log(`8`)
  } finally {
    if (page != null) await page.close()
  }
  const ttRenderMs = Date.now() - start
  console.info(`Headless rendered page in: ${ttRenderMs}ms`)

  RENDER_CACHE.set(url, html) // cache rendered page.

  return { html, ttRenderMs }
}

function isCache(url) {
  return RENDER_CACHE.has(url)
}

function clearCache() {
  RENDER_CACHE.clear()
}

export { ssr, clearCache, isCache }
