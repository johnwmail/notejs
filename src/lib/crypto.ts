const FORMAT = "notejs-protected-note";
const VERSION = 1;
// Cloudflare Workers WebCrypto caps PBKDF2 at 100,000 iterations,
// so both Cloudflare and Vercel use this value.
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const DERIVED_BYTES = 64;
const AAD = new TextEncoder().encode("notejs-protected-note-v1");

export interface ProtectedNoteRecord {
  format: typeof FORMAT;
  version: typeof VERSION;
  state: "active" | "burned";
  iterations: number;
  salt: string;
  verifier: string;
  iv?: string;
  ciphertext?: string;
}

export class InvalidPasswordError extends Error {
  constructor() {
    super("Incorrect password");
    this.name = "InvalidPasswordError";
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

async function deriveMaterial(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: asArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
    },
    passwordKey,
    DERIVED_BYTES * 8
  );
  return new Uint8Array(bits);
}

async function verifierFor(material: Uint8Array): Promise<Uint8Array> {
  const label = new TextEncoder().encode("notejs-password-verifier-v1:");
  const input = new Uint8Array(label.length + 32);
  input.set(label);
  input.set(material.subarray(32, 64), label.length);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", asArrayBuffer(input)));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) {
    difference |= left[i] ^ right[i];
  }
  return difference === 0;
}

async function importEncryptionKey(material: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    asArrayBuffer(material.subarray(0, 32)),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

export function parseProtectedNoteRecord(value: string): ProtectedNoteRecord | null {
  try {
    const parsed = JSON.parse(value) as Partial<ProtectedNoteRecord>;
    if (
      parsed.format !== FORMAT ||
      parsed.version !== VERSION ||
      (parsed.state !== "active" && parsed.state !== "burned") ||
      parsed.iterations !== PBKDF2_ITERATIONS ||
      typeof parsed.salt !== "string" ||
      typeof parsed.verifier !== "string"
    ) {
      return null;
    }

    if (
      parsed.state === "active" &&
      (typeof parsed.iv !== "string" || typeof parsed.ciphertext !== "string")
    ) {
      return null;
    }

    return parsed as ProtectedNoteRecord;
  } catch {
    return null;
  }
}

export async function encryptProtectedNote(
  content: string,
  password: string
): Promise<ProtectedNoteRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const material = await deriveMaterial(password, salt);

  try {
    const key = await importEncryptionKey(material);
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: asArrayBuffer(iv), additionalData: asArrayBuffer(AAD) },
      key,
      new TextEncoder().encode(content)
    );

    return {
      format: FORMAT,
      version: VERSION,
      state: "active",
      iterations: PBKDF2_ITERATIONS,
      salt: toBase64(salt),
      verifier: toBase64(await verifierFor(material)),
      iv: toBase64(iv),
      ciphertext: toBase64(new Uint8Array(encrypted)),
    };
  } finally {
    material.fill(0);
  }
}

export async function decryptProtectedNote(
  record: ProtectedNoteRecord,
  password: string
): Promise<string> {
  if (record.state !== "active" || !record.iv || !record.ciphertext) {
    throw new InvalidPasswordError();
  }

  const salt = fromBase64(record.salt);
  const material = await deriveMaterial(password, salt);
  try {
    const expectedVerifier = fromBase64(record.verifier);
    if (!constantTimeEqual(await verifierFor(material), expectedVerifier)) {
      throw new InvalidPasswordError();
    }

    const key = await importEncryptionKey(material);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: asArrayBuffer(fromBase64(record.iv)),
        additionalData: asArrayBuffer(AAD),
      },
      key,
      asArrayBuffer(fromBase64(record.ciphertext))
    );
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    if (error instanceof InvalidPasswordError) throw error;
    throw new InvalidPasswordError();
  } finally {
    material.fill(0);
  }
}

export async function verifyProtectedNotePassword(
  record: ProtectedNoteRecord,
  password: string
): Promise<boolean> {
  const material = await deriveMaterial(password, fromBase64(record.salt));
  try {
    return constantTimeEqual(
      await verifierFor(material),
      fromBase64(record.verifier)
    );
  } finally {
    material.fill(0);
  }
}

export function burnProtectedNote(record: ProtectedNoteRecord): ProtectedNoteRecord {
  return {
    format: FORMAT,
    version: VERSION,
    state: "burned",
    iterations: record.iterations,
    salt: record.salt,
    verifier: record.verifier,
  };
}

export function serializeProtectedNote(record: ProtectedNoteRecord): string {
  return JSON.stringify(record);
}

export const MIN_PASSWORD_LENGTH = 8;
