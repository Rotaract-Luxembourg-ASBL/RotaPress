import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

export async function ask(
  label,
  { secret = false, fallback = "", valid = (v) => Boolean(v) } = {},
) {
  if (!process.stdin.isTTY)
    throw new Error("Run the hosting assistant in an interactive terminal.");
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, done) {
      if (!muted) process.stdout.write(chunk, encoding);
      done();
    },
  });
  const input = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  try {
    for (;;) {
      const pending = input.question(
        `${label}${fallback ? ` [${fallback}]` : ""}: `,
      );
      muted = secret;
      const value = (await pending).trim() || fallback;
      muted = false;
      if (secret) process.stdout.write("\n");
      if (value.length <= 254 && !/[\r\n\0]/u.test(value) && valid(value))
        return value;
      console.log("Please check that value and try again.");
    }
  } finally {
    input.close();
  }
}

export async function confirm(label) {
  return (
    (await ask(`${label} Type yes to continue`, { fallback: "no" })) === "yes"
  );
}
