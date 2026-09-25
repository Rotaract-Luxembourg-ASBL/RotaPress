/** Runs only in an opaque-origin sandbox. Never inject this into the parent document. */
export function customCodeDocument(
  html: string,
  css: string,
  javascript: string,
): string {
  const policy =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  // Prevent authored CSS/JS from terminating their element while building the document.
  const style = css.replace(/<\/style/gi, "<\\/style");
  const script = javascript.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:16px system-ui,sans-serif;overflow-wrap:anywhere}*{box-sizing:border-box}img{max-width:100%}${style}</style></head><body>${html}<script>${script}</script></body></html>`;
}
