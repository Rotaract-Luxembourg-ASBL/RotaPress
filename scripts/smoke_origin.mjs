const port = process.env.ROTAPRESS_SMOKE_PORT || "3001";
if (!/^\d{2,5}$/.test(port) || Number(port) < 1024 || Number(port) > 65535) {
  throw new Error("ROTAPRESS_SMOKE_PORT must be an unprivileged local TCP port.");
}
export const smokePort = port;
export const smokeOrigin = `http://127.0.0.1:${port}`;
