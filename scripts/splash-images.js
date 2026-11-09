// Genera le immagini d'avvio iOS fotografando lo splash vero (stato finale, senza animazione) a ogni dimensione di iPhone.
// Uso: con l'app avviata in locale, `node scripts/splash-images.js http://localhost:3100`
const { chromium } = require("playwright");
const SIZES = [[375, 667, 2], [414, 736, 3], [375, 812, 3], [414, 896, 2], [414, 896, 3], [390, 844, 3], [428, 926, 3], [393, 852, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3], [420, 912, 3]];
(async () => {
  const base = process.argv[2] ?? "http://localhost:3100";
  const browser = await chromium.launch();
  for (const [w, h, r] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: r, reducedMotion: "reduce", colorScheme: "light" });
    const page = await ctx.newPage();
    await page.goto(`${base}/accesso`, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: ".splash{transition:none!important} body>*:not(.splash){visibility:hidden}" });
    await page.evaluate(() => document.fonts.ready);
    await page.locator(".splash").waitFor();
    await page.screenshot({ path: `public/splash/${w * r}x${h * r}.png`, clip: { x: 0, y: 0, width: w, height: h } });
    await ctx.close();
  }
  await browser.close();
})();
