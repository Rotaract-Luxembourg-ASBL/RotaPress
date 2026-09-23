import { compose, reportFailure } from "./local_common.mjs";

try {
  const action = process.argv[2];
  if (action === "start") compose(["up", "--detach", "--wait", "--wait-timeout", "90"]);
  else if (action === "stop") compose(["stop"]);
  else if (action === "status") compose(["ps"]);
  else throw new Error("Use services.mjs start, stop or status. Persistent volumes are always preserved.");
} catch (error) {
  reportFailure(error);
}
