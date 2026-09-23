import "server-only";
import { db } from "../../infrastructure/database/client";
import { CredentialCipher } from "../../infrastructure/security/CredentialCipher";
import { config } from "../config";
import { GoogleAuthStore } from "./GoogleAuthStore";

export const googleAuthStore = new GoogleAuthStore(
  db,
  new CredentialCipher(config.INTEGRATION_ENCRYPTION_KEY),
);
