import { resolve } from "node:path";
import { compose, readEnv, reportFailure, root } from "./local_common.mjs";

try {
  const action = process.argv[2];
  const profiles = readEnv(resolve(root, ".env.local")).EMAIL_PROVIDER === "development"
    ? ["--profile", "development"] : [];
  if (action === "start") compose([...profiles, "up", "--detach", "--wait", "--wait-timeout", "90"]);
  else if (action === "stop") compose(["--profile", "development", "stop"]);
  else if (action === "status") compose(["--profile", "development", "ps"]);
  else throw new Error("Use services.mjs start, stop or status. Persistent volumes are always preserved.");
} catch (error) {
  reportFailure(error);
}
