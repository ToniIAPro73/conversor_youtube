import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { StoredAgentIdentity } from "./types.js";

export interface CredentialStore {
  load(): Promise<StoredAgentIdentity | null>;
  save(identity: StoredAgentIdentity): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryCredentialStore implements CredentialStore {
  private identity: StoredAgentIdentity | null = null;

  async load(): Promise<StoredAgentIdentity | null> {
    return this.identity ? structuredClone(this.identity) : null;
  }

  async save(identity: StoredAgentIdentity): Promise<void> {
    this.identity = structuredClone(identity);
  }

  async clear(): Promise<void> {
    this.identity = null;
  }
}

export class EncryptedFileCredentialStore implements CredentialStore {
  constructor(
    private readonly filePath: string,
    private readonly passphrase: string
  ) {
    if (passphrase.length < 16) {
      throw new Error("Portable credential store requires ANCLORA_AGENT_STORE_KEY with at least 16 characters.");
    }
  }

  async load(): Promise<StoredAgentIdentity | null> {
    if (!existsSync(this.filePath)) return null;
    const fileMode = statSync(this.filePath).mode & 0o777;
    if ((fileMode & 0o077) !== 0) {
      throw new Error("Credential store permissions are too broad; expected 0600.");
    }

    const envelope = JSON.parse(readFileSync(this.filePath, "utf8")) as {
      version: 1;
      salt: string;
      iv: string;
      tag: string;
      ciphertext: string;
    };
    const key = deriveKey(this.passphrase, Buffer.from(envelope.salt, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as StoredAgentIdentity;
  }

  async save(identity: StoredAgentIdentity): Promise<void> {
    mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = deriveKey(this.passphrase, salt);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(identity), "utf8"),
      cipher.final(),
    ]);
    const envelope = {
      version: 1 as const,
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    writeFileSync(this.filePath, JSON.stringify(envelope, null, 2), { mode: 0o600 });
    chmodSync(this.filePath, 0o600);
  }

  async clear(): Promise<void> {
    if (existsSync(this.filePath)) {
      writeFileSync(this.filePath, "", { mode: 0o600 });
    }
  }
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return createHash("sha256").update("anclora-filestudio-agent:").update(passphrase).update(salt).digest();
}
