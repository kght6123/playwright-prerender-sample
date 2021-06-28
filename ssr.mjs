// https://playwright.dev/docs/next/api/class-browsertype
import { chromium } from "playwright-chromium";
import { URL } from "url";

// In-memory cache of rendered pages. Note: this will be cleared whenever the
// server process stops. If you need true persistence, use something like
// Google Cloud Storage (https://firebase.google.com/docs/storage/web/start).
const RENDER_CACHE = new Map();

async function ssr(url, wsEndpoint, waitForSelector) {
  if (RENDER_CACHE.has(url)) {
    return { html: RENDER_CACHE.get(url), ttRenderMs: 0 };
  }
  console.log(`1`);
  const start = Date.now();
  // https://playwright.dev/docs/next/api/class-browser
  const browser = await chromium.connect({ wsEndpoint });
  let page = null;
  let html = null;
  try {
    console.log(`2`);
    page = await browser.newPage();
    // Googleアナリティクスをブロック
    await page.route(
      (url) => {
        const blocklist = [
          "www.google-analytics.com",
          "/gtag/js",
          "ga.js",
          "analytics.js",
        ];
        console.log(`url=${url}`);
        if (blocklist.find((regex) => url.toString().match(regex))) {
          console.log(`yes`);
          return true;
        } else {
          console.log(`no`);
          return false;
        }
      },
      (route) => route.abort()
    );
    // ドキュメントとスクリプト、Ajax、Fetch、CSS のみ許可する
    await page.route(
      () => true,
      (route, req) => {
        const allowlist = ["document", "script", "xhr", "fetch", "stylesheet"];
        if (!allowlist.includes(req.resourceType())) {
          route.abort();
        } else {
          route.continue();
        }
      }
    );
    console.log(`3`);
    const stylesheetContents = {};
    const scriptContents = {};
    // CSS、Scriptファイルの内容を取得して保存する
    page.on("response", async (resp) => {
      const responseUrl = resp.url();
      const sameOrigin = new URL(responseUrl).origin === new URL(url).origin;
      const isStylesheet = resp.request().resourceType() === "stylesheet";
      const isScript = resp.request().resourceType() === "script";
      // console.log(responseUrl, resp.request().resourceType(), sameOrigin, isStylesheet, isScript);
      if (sameOrigin && isStylesheet) {
        // TODO: ここでstyleの縮小(min化)したり、不要なstyleの削除ができないかな？
        stylesheetContents[responseUrl] = await resp.text();
        // console.log(stylesheetContents[responseUrl]);
      }
      if (sameOrigin && isScript) {
        // TODO: ここでscriptの縮小(min化)したり、不要なscriptの削除ができないかな？
        scriptContents[responseUrl] = await resp.text();
      }
    });
    console.log(`4`);
    // ヘッドレスブラウザで、プレレンダリングする
    try {
      // networkidle0 waits for the network to be idle (no requests for 500ms).
      // The page's JS has likely produced markup by this point, but wait longer
      // if your site lazy loads, etc.
      // 2. Load page as normal, waiting for network requests to be idle.
      const renderUrl = new URL(url);
      // headlessで描画されていることを教える、もしくは、Page.evaluateOnNewDocument() を使う。
      renderUrl.searchParams.set("headless", "");
      await page.goto(url); // { waitUntil: 'networkidle0' }
      console.log(`5`);
      // 仮で入れる
      // await page.waitForNavigation({waitUntil: ['load', 'networkidle']});
      // https://playwright.dev/docs/next/api/class-page#pagewaitforloadstatestate-options
      await page.waitForLoadState("networkidle"); // ensure #posts exists in the DOM.
      console.log(`6`);
    } catch (err) {
      console.error(err);
      // 一時的にコメントアウトもあり
      throw new Error("page.goto/waitForSelector timed out.");
    }
    // CSSをインライン化する
    await page.$$eval(
      'link[rel="stylesheet"]',
      (links, content) => {
        links.forEach((link) => {
          const cssText = content[link.href];
          if (cssText) {
            const style = document.createElement("style");
            style.textContent = cssText;
            link.replaceWith(style);
          }
        });
      },
      stylesheetContents
    );
    // Scriptをインライン化する
    await page.$$eval(
      "script[src]",
      (scripts, content) => {
        scripts.forEach((script) => {
          const jsText = content[script.src];
          if (jsText) {
            const scriptEl = document.createElement("script");
            scriptEl.textContent = jsText;
            // FIXME: これをやるとscriptが動き始めるので、アクセスできなくてエラーになるサイトがある
            // script.replaceWith(scriptEl);
          }
        });
      },
      scriptContents
    );
    console.log(`7`);
    // プレレンダリングされたHTMLを取得する
    html = await page.content();
    console.log(`8`);
  } finally {
    // ページを閉じる
    if (page != null) await page.close();
  }
  // 処理時間をログに出力
  const ttRenderMs = Date.now() - start;
  console.info(`Headless rendered page in: ${ttRenderMs}ms`);
  // キャッシュにHTMLを保存
  RENDER_CACHE.set(url, html);
  // レンダリング結果をルーターに返す
  return { html, ttRenderMs };
}

function clearCache() {
  RENDER_CACHE.clear();
}

export { ssr, clearCache };
