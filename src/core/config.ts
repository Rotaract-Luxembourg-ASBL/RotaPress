import "server-only";
import { runtimeConfiguration } from "./runtime_configuration";
import { serverEmailConfiguration } from "@/infrastructure/email/server_email_configuration";

export const config = runtimeConfiguration(process.env);
export const serverEmail = serverEmailConfiguration(
  process.env,
  config.APP_URL,
  config.DATABASE_URL,
);
