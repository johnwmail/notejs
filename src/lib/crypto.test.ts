import { describe, expect, it } from "vitest";
import {
  burnProtectedNote,
  decryptProtectedNote,
  encryptProtectedNote,
  InvalidPasswordError,
  parseProtectedNoteRecord,
  serializeProtectedNote,
  verifyProtectedNotePassword,
} from "./crypto";

describe("protected note encryption", () => {
  it("encrypts and decrypts note content with its password", async () => {
    const password = "a-long-test-passphrase";
    const content = "secret note content";
    const record = await encryptProtectedNote(content, password);
    const serialized = serializeProtectedNote(record);

    expect(serialized).not.toContain(content);
    expect(serialized).not.toContain(password);
    expect(await decryptProtectedNote(record, password)).toBe(content);
    expect(parseProtectedNoteRecord(serialized)).toEqual(record);
  });

  it("rejects an incorrect password", async () => {
    const record = await encryptProtectedNote("secret", "correct-password");

    await expect(
      decryptProtectedNote(record, "incorrect-password")
    ).rejects.toBeInstanceOf(InvalidPasswordError);
  });

  it("retains only a password verifier after burning the content", async () => {
    const record = await encryptProtectedNote("secret", "correct-password");
    const burned = burnProtectedNote(record);

    expect(burned.state).toBe("burned");
    expect(burned.ciphertext).toBeUndefined();
    expect(burned.iv).toBeUndefined();
    expect(await verifyProtectedNotePassword(burned, "correct-password")).toBe(true);
    expect(await verifyProtectedNotePassword(burned, "incorrect-password")).toBe(false);
  });
});
