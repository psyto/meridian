// @ts-nocheck
import puppeteer, { Page } from "puppeteer";
import { PuppeteerScreenRecorder } from "puppeteer-screen-recorder";

const BASE_URL = "http://localhost:3000";
const OUTPUT_FILE = "demo-dashboard.mp4";

const VIEWPORT = { width: 1280, height: 720 };

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function slowScroll(page: Page, distance = 300, steps = 3) {
  for (let i = 0; i < steps; i++) {
    await page.evaluate((d) => window.scrollBy(0, d), distance);
    await sleep(800);
  }
}

async function scrollToTop(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
}

async function waitForContent(page: Page) {
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 10000 }).catch(() => {});
  await sleep(1000);
}

async function navigateAndWait(page: Page, url: string) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForContent(page);
}

async function clickNavLink(page: Page, text: string) {
  const links = await page.$$("a");
  for (const link of links) {
    const linkText = await page.evaluate((el) => el.textContent?.trim() || "", link);
    if (linkText.includes(text)) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {}),
        link.click(),
      ]);
      await waitForContent(page);
      return;
    }
  }
  console.warn(`Link "${text}" not found`);
}

async function checkServer(): Promise<boolean> {
  try {
    const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  // Check if the app is running
  const serverUp = await checkServer();
  if (!serverUp) {
    console.error("Error: Cannot connect to the Meridian app at " + BASE_URL);
    console.error("Start the app first: cd app && pnpm dev");
    process.exit(1);
  }

  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: VIEWPORT,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  const recorder = new PuppeteerScreenRecorder(page, {
    followNewTab: false,
    fps: 30,
    videoFrame: {
      width: VIEWPORT.width,
      height: VIEWPORT.height,
    },
    aspectRatio: "16:9",
  });

  console.log("Starting recording...");
  await recorder.start(OUTPUT_FILE);

  try {
    // ── 1. Landing page — hero, features, stats ──
    console.log("1. Landing page");
    await navigateAndWait(page, BASE_URL);
    await sleep(2000);
    await slowScroll(page, 400, 4); // Scroll through features and stats sections
    await sleep(1000);
    await scrollToTop(page);
    await sleep(500);

    // ── 2. Navigate to Dashboard — portfolio cards, balances ──
    console.log("2. Navigate to Dashboard");
    await clickNavLink(page, "ダッシュボード");
    await sleep(2000);
    await slowScroll(page, 300, 3);
    await sleep(1000);
    await scrollToTop(page);

    // ── 3. Navigate to Trade — swap form, markets ──
    console.log("3. Navigate to Trade");
    await clickNavLink(page, "取引");
    await sleep(2000);
    await slowScroll(page, 300, 2);
    await sleep(1000);
    await scrollToTop(page);

    // ── 4. Navigate to Compliance — KYC status ──
    console.log("4. Navigate to Compliance");
    await clickNavLink(page, "コンプライアンス");
    await sleep(2000);
    await slowScroll(page, 300, 2);
    await sleep(1000);
    await scrollToTop(page);

    // ── 5. Navigate to Portfolio — asset holdings ──
    console.log("5. Navigate to Portfolio");
    await clickNavLink(page, "ポートフォリオ");
    await sleep(2000);
    await slowScroll(page, 300, 2);
    await sleep(1000);
    await scrollToTop(page);

    // ── 6. Back to Dashboard, hold 3s ──
    console.log("6. Back to Dashboard");
    await clickNavLink(page, "ダッシュボード");
    await sleep(3000);
  } catch (error) {
    console.error("Error during recording:", error);
  }

  // ── Stop recording ──
  console.log("Stopping recording...");
  await recorder.stop();

  await browser.close();
  console.log(`Recording saved to ${OUTPUT_FILE}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
