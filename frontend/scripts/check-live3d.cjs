const { chromium } = require("playwright");

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 900 },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(45000);
      await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded" });
      await page.waitForSelector("canvas");
      await page.waitForFunction(() => document.body.innerText.includes("model=ready"));
      await page.waitForTimeout(500);

      const result = await page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        if (!(canvas instanceof HTMLCanvasElement)) {
          return { ok: false, reason: "canvas missing" };
        }

        const width = Math.min(160, canvas.width);
        const height = Math.min(120, canvas.height);
        const sample = document.createElement("canvas");
        sample.width = width;
        sample.height = height;
        const ctx = sample.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          return { ok: false, reason: "2d sampling context unavailable" };
        }
        ctx.drawImage(canvas, 0, 0, width, height);
        const pixels = ctx.getImageData(0, 0, width, height).data;
        let litPixels = 0;
        let totalLuma = 0;
        let minLuma = 255;
        let maxLuma = 0;

        for (let index = 0; index < pixels.length; index += 4) {
          const alpha = pixels[index + 3];
          if (alpha === 0) continue;
          const luma = 0.2126 * pixels[index] + 0.7152 * pixels[index + 1] + 0.0722 * pixels[index + 2];
          totalLuma += luma;
          minLuma = Math.min(minLuma, luma);
          maxLuma = Math.max(maxLuma, luma);
          if (luma > 20) {
            litPixels += 1;
          }
        }

        const totalPixels = width * height;
        return {
          ok: litPixels > totalPixels * 0.02 && maxLuma - minLuma > 8,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          litPixels,
          totalPixels,
          avgLuma: totalLuma / totalPixels,
          lumaRange: maxLuma - minLuma,
        };
      });

      const screenshotPath = `/tmp/reachy-live3d-${viewport.name}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });

      console.log(JSON.stringify({ viewport, screenshotPath, result }, null, 2));
      if (!result.ok) {
        throw new Error(`Live 3D canvas check failed for ${viewport.name}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
