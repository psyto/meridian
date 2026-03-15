// @ts-nocheck
import puppeteer from "puppeteer";
import { PuppeteerScreenRecorder } from "puppeteer-screen-recorder";
import { spawn } from "child_process";
import { createInterface } from "readline";
import { resolve } from "path";

const OUTPUT_FILE = "demo-cli.mp4";
const VIEWPORT = { width: 1280, height: 720 };
const TITLE = "MERIDIAN — Shield Escrow Swap";
const DEMO_CMD = "npx";
const DEMO_ARGS = ["tsx", "scripts/demo-devnet.ts"];
const LINE_DELAY = 120;

function buildTerminalHTML(title: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>* { margin: 0; padding: 0; box-sizing: border-box; }</style></head>
<body style="margin:0;padding:0;overflow:hidden;">
<div style="background: #1a1b26; color: #a9b1d6; font-family: 'SF Mono', 'Menlo', monospace; font-size: 14px; padding: 20px; height: 100vh; overflow: hidden;">
  <div style="background: #24283b; padding: 8px 16px; border-radius: 8px 8px 0 0; display: flex; align-items: center;">
    <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #ff5f57; margin-right: 8px;"></span>
    <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #febc2e; margin-right: 8px;"></span>
    <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: #28c840; margin-right: 16px;"></span>
    <span style="color: #7aa2f7; font-size: 13px;">${title}</span>
  </div>
  <div id="terminal" style="background: #1a1b26; padding: 16px; height: calc(100vh - 60px); overflow-y: auto; white-space: pre-wrap; line-height: 1.5;">
  </div>
</div>
</body>
</html>`;
}

function styleLine(raw: string): string {
  let text = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  if (/FAILED|Error/i.test(text)) {
    return `<div style="color: #f7768e;">${text}</div>`;
  }
  if (/COMPLETE/i.test(text)) {
    return `<div style="color: #9ece6a; font-weight: bold;">${text}</div>`;
  }
  if (/^===/.test(text)) {
    return `<div style="color: #7aa2f7; font-weight: bold;">${text}</div>`;
  }
  if (/STEP/i.test(text)) {
    text = `<div style="font-weight: bold;">${text}</div>`;
  } else {
    text = `<div>${text}</div>`;
  }

  // Highlight tx signatures
  text = text.replace(
    /(tx:\s*)([A-Za-z0-9]{20,})/g,
    '$1<span style="color: #9ece6a;">$2</span>'
  );

  // Highlight amounts with JPY or SOL
  text = text.replace(
    /([\d,.]+\s*(?:JPY|SOL))/g,
    '<span style="color: #e0af68;">$1</span>'
  );

  return text;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const cwd = resolve(__dirname, "..");
  console.log(`Working directory: ${cwd}`);
  console.log("Launching browser...");

  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: VIEWPORT,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.setContent(buildTerminalHTML(TITLE));

  const recorder = new PuppeteerScreenRecorder(page, {
    followNewTab: false,
    fps: 30,
    videoFrame: { width: VIEWPORT.width, height: VIEWPORT.height },
    aspectRatio: "16:9",
  });

  console.log("Starting recording...");
  await recorder.start(resolve(cwd, OUTPUT_FILE));

  // Small pause before output starts
  await sleep(1000);

  const child = spawn(DEMO_CMD, DEMO_ARGS, {
    cwd,
    shell: true,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const rl = createInterface({ input: child.stdout! });
  const rlErr = createInterface({ input: child.stderr! });

  const appendLine = async (raw: string) => {
    const html = styleLine(raw);
    await page.evaluate((h: string) => {
      const term = document.getElementById("terminal")!;
      term.insertAdjacentHTML("beforeend", h);
      // Keep roughly last 35 lines visible
      while (term.children.length > 35) {
        term.removeChild(term.firstChild!);
      }
      term.scrollTop = term.scrollHeight;
    }, html);
    await sleep(LINE_DELAY);
  };

  rl.on("line", (line) => {
    console.log(line);
    appendLine(line);
  });

  rlErr.on("line", (line) => {
    console.error(line);
    appendLine(line);
  });

  await new Promise<void>((resolveP) => {
    child.on("close", () => resolveP());
  });

  // 3-second pause showing final summary
  console.log("Pausing on final frame...");
  await sleep(3000);

  console.log("Stopping recording...");
  await recorder.stop();
  await browser.close();

  const outputPath = resolve(cwd, OUTPUT_FILE);
  console.log(`Recording saved to ${outputPath}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
