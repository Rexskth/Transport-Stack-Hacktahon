// End-to-end check of the UI in a real Chrome. Start the API first (uvicorn api.main:app), then: npm run e2e
// Env: BASE_URL (default http://localhost:8000/), CHROME_PATH (default: macOS Google Chrome), SHOTS (screenshot folder).
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = process.env.SHOTS ?? join(tmpdir(), "bus-crowding-e2e");
mkdirSync(OUT, { recursive: true });
const URL = process.env.BASE_URL ?? "http://localhost:8000/";
const results = [];
const check = (name, ok, extra = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--disable-gpu", "--hide-scrollbars"],
});
const errors = [];
async function newPage(opts = {}) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/tile|ERR_|favicon|404|422/.test(m.text())) errors.push("console: " + m.text()); });
  await page.setViewport(opts.viewport ?? { width: 1440, height: 900 });
  if (opts.scheme) await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: opts.scheme }]);
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }, ...(opts.scheme ? [{ name: "prefers-color-scheme", value: opts.scheme }] : [])]);
  return page;
}
const txt = (page, sel) => page.$$eval(sel, (els) => els.map((e) => e.textContent));

/* 1. planner, desktop, dark */
let page = await newPage({ scheme: "dark" });
await page.goto(URL + "?from=7699&to=365&depart=18:00", { waitUntil: "networkidle2" });
await page.waitForSelector("article", { timeout: 15000 });
await sleep(1500);
const vals = await page.$$eval('input[role="combobox"]', (e) => e.map((x) => x.value));
check("planner: place names resolved from ids", vals[0].includes("Anand Vihar") && vals[1].includes("Connaught"), JSON.stringify(vals));
const cards = await page.$$eval("article", (a) => a.length);
check("planner: shows journey cards", cards >= 2, `${cards} cards`);
const first = (await txt(page, "article"))[0];
check("planner: first card is 943UP crowded", first.includes("943UP") && first.includes("Crowded"), first.slice(0, 60));
check("planner: map route drawn", (await page.$$eval("path.leaflet-interactive", (p) => p.length)) > 5);
await page.screenshot({ path: `${OUT}/e2e-plan-dark.png` });

/* 2. comfort toggle */
const radios = await page.$$('[role="radio"]');
for (const r of radios) { const t = await r.evaluate((e) => e.textContent); if (t.includes("More comfortable")) { await r.click(); break; } }
await page.waitForFunction(() => location.search.includes("prefer=comfort"), { timeout: 8000 });
await sleep(2500);
await page.waitForSelector("article", { timeout: 10000 });
const firstC = (await txt(page, "article"))[0] ?? "";
check("comfort: re-sorted (first option no longer 943UP crowded)", !(firstC.includes("943UP") && firstC.includes("Crowded")), firstC.slice(0, 70));
check("url: shareable prefer=comfort", page.url().includes("prefer=comfort"), page.url());
await page.screenshot({ path: `${OUT}/e2e-comfort-dark.png` });

/* 3. combobox typing */
await page.goto(URL, { waitUntil: "networkidle2" });
await page.waitForSelector('input[role="combobox"]');
const input = (await page.$$('input[role="combobox"]'))[0];
await input.click();
await input.type("kashmere", { delay: 30 });
await page.waitForSelector('[role="option"]', { timeout: 8000 });
const opts = await txt(page, '[role="option"]');
check("search: suggestions appear while typing", opts.length > 0 && /kashmere/i.test(opts[0]), opts[0]?.slice(0, 50));
await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
await sleep(300);
const picked = await input.evaluate((e) => e.value);
check("search: keyboard selection fills the box", /kashmere/i.test(picked), picked);

/* 4. map click sets A then B */
await page.goto(URL, { waitUntil: "networkidle2" });
await page.waitForSelector(".leaflet-container");
await page.mouse.click(900, 450); await sleep(300); await page.mouse.click(1100, 600); await sleep(2500);
const mv = await page.$$eval('input[role="combobox"]', (e) => e.map((x) => x.value));
const shown = await page.evaluate(() => document.querySelector('[role="alert"]')?.textContent ?? (document.querySelector("article") ? "results" : ""));
check("map: result or a friendly message is shown for clicked points", shown.length > 0, shown.slice(0, 90));
check("map: two clicks set From and To as coordinates", /\d+\.\d+, \d+\.\d+/.test(mv[0]) && /\d+\.\d+, \d+\.\d+/.test(mv[1]), JSON.stringify(mv));

/* 5. network tab */
await page.goto(URL + "?tab=network&hour=9", { waitUntil: "networkidle2" });
await page.waitForSelector(".recharts-bar-rectangle", { timeout: 15000 });
await page.waitForSelector("ol li button", { timeout: 15000 });
const routes = await page.$$eval("ol li button", (b) => b.length);
check("network: chart and ranked routes render", routes >= 5, `${routes} routes`);
const hourBefore = await page.$eval('input[type="range"]', (e) => e.value);
const play = await page.$('button[aria-label*="Play"]'); await play.click(); await sleep(3500);
const hourAfter = await page.$eval('input[type="range"]', (e) => e.value);
check("network: play advances the hour", hourBefore !== hourAfter, `${hourBefore} -> ${hourAfter}`);
await (await page.$('button[aria-label*="Pause"]')).click();
await page.click("ol li button"); await sleep(2500);
check("network: selecting a route shows its profile chart", (await page.$$(".recharts-area").then((a) => a.length)) > 0);
await page.screenshot({ path: `${OUT}/e2e-network-dark.png` });

/* 6. light theme + about */
await page.close();
page = await newPage({ scheme: "light" });
await page.goto(URL + "?from=2640&to=7930&depart=08:30", { waitUntil: "networkidle2" });
await page.waitForSelector("article", { timeout: 15000 }); await sleep(1500);
await page.screenshot({ path: `${OUT}/e2e-plan-light.png` });
await page.click('button[aria-label="About this data"]'); await sleep(400);
check("about dialog opens", (await page.$('[role="dialog"]')) !== null);
await page.screenshot({ path: `${OUT}/e2e-about-light.png` });
await page.keyboard.press("Escape"); await sleep(400);
check("about dialog closes with Escape", (await page.$('[role="dialog"]')) === null);
await page.close();

/* 7. phone (390x844, touch) */
page = await newPage({ scheme: "dark", viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } });
await page.goto(URL + "?from=7699&to=365&depart=18:00", { waitUntil: "networkidle2" });
await page.waitForSelector("article", { timeout: 15000 }); await sleep(1500);
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check("phone: no horizontal overflow at 390px", !overflow);
await page.screenshot({ path: `${OUT}/e2e-phone-sheet-mid.png` });
await page.click('[aria-label="Resize panel"]'); await sleep(700);
await page.screenshot({ path: `${OUT}/e2e-phone-sheet-full.png` });
await page.click('[aria-label="Resize panel"]'); await sleep(400);
await page.click('[aria-label="Resize panel"]'); await sleep(600);
await page.screenshot({ path: `${OUT}/e2e-phone-sheet-peek.png` });
await page.close();

check("no uncaught errors or console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
