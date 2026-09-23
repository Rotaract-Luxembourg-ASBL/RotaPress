import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { DomainError } from "../../core/authorization/AuthorizationService";

/** AES-256-GCM, with the organization and stable connection ID authenticated as AAD. */
export class CredentialCipher {
  readonly ready: boolean;
  constructor(private readonly keyHex?: string) {
    this.ready = Boolean(keyHex && /^[a-f0-9]{64}$/i.test(keyHex));
  }
  private key() {
    if (!this.ready || !this.keyHex)
      throw new DomainError(
        "ENCRYPTION_UNAVAILABLE",
        "Configure the installation credential encryption key before saving API credentials.",
        409,
      );
    return Buffer.from(this.keyHex, "hex");
  }
  seal(value: string, scope: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key(), iv);
    cipher.setAAD(Buffer.from(scope));
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    return [
      "v1",
      iv.toString("hex"),
      cipher.getAuthTag().toString("hex"),
      encrypted.toString("hex"),
    ].join(".");
  }
  open(envelope: string, scope: string): string {
    try {
      const [version, iv, tag, ciphertext, extra] = envelope.split(".");
      if (
        version !== "v1" ||
        extra !== undefined ||
        !/^[a-f0-9]{24}$/.test(iv ?? "") ||
        !/^[a-f0-9]{32}$/.test(tag ?? "") ||
        !/^(?:[a-f0-9]{2}){16,512}$/.test(ciphertext ?? "")
      )
        throw new Error("Invalid envelope");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        this.key(),
        Buffer.from(iv, "hex"),
      );
      decipher.setAAD(Buffer.from(scope));
      decipher.setAuthTag(Buffer.from(tag, "hex"));
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "hex")),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new DomainError(
        "CREDENTIAL_UNREADABLE",
        "The saved credential could not be decrypted.",
        409,
      );
    }
  }
}
