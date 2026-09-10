/**
 * Secrets manager (basic): AES-GCM vault keyed by a master password
 * (PBKDF2-SHA256, 250k iterations). The key lives only in memory after
 * unlock; storage (app config dir) holds ciphertext only. Rust persists
 * blobs — it never sees plaintext or the master password.
 */

export interface SecretBlob {
  name: string;
  /** base64 PBKDF2 salt */
  salt: string;
  /** base64 96-bit AES-GCM IV */
  iv: string;
  /** base64 ciphertext */
  data: string;
}

export interface UnlockState {
  unlocked: boolean;
  entries: SecretBlob[];
}

const PBKDF2_ITERATIONS = 250_000;

let key: CryptoKey | null = null;
let keySalt = "";

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(master: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(master),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Unlock the vault (validates against the first entry, or initializes). */
export async function unlockVault(
  master: string,
  entries: SecretBlob[],
): Promise<boolean> {
  if (entries.length === 0) {
    // Fresh vault: derive a key now; it becomes the master key.
    const salt = crypto.getRandomValues(new Uint8Array(16));
    key = await deriveKey(master, salt);
    keySalt = toB64(salt);
    return true;
  }
  const salt = fromB64(entries[0].salt);
  const candidate = await deriveKey(master, salt);
  try {
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(entries[0].iv) as unknown as BufferSource },
      candidate,
      fromB64(entries[0].data) as unknown as BufferSource,
    );
    key = candidate;
    keySalt = entries[0].salt;
    return true;
  } catch {
    return false;
  }
}

export function lockVault(): void {
  key = null;
}

export function isUnlocked(): boolean {
  return key !== null;
}

/** Encrypt a secret; reuses the vault salt so any entry can validate. */
export async function encryptSecret(value: string): Promise<Omit<SecretBlob, "name">> {
  if (!key) throw new Error("vault locked");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    new TextEncoder().encode(value),
  );
  return { salt: keySalt, iv: toB64(iv), data: toB64(data) };
}

export async function decryptSecret(blob: SecretBlob): Promise<string> {
  if (!key) throw new Error("vault locked");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(blob.iv) as unknown as BufferSource },
    key,
    fromB64(blob.data) as unknown as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

/**
 * Substitute {secret:name} references in trigger send-text / auto-answer
 * payloads. The resolver is injected so this stays pure and testable.
 */
export async function resolveSecretRefs(
  text: string,
  resolve: (name: string) => Promise<string | null>,
): Promise<string> {
  const re = /\{secret:([^}]+)\}/g;
  let out = text;
  const matches = [...text.matchAll(re)];
  for (const m of matches) {
    const value = await resolve(m[1]);
    if (value !== null) out = out.replace(m[0], value);
  }
  return out;
}

/** Names referenced via {secret:…} in a payload (for validation). */
export function secretRefs(text: string): string[] {
  return [...text.matchAll(/\{secret:([^}]+)\}/g)].map((m) => m[1]);
}
