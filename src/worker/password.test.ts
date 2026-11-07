import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password", () => {
  it("accepts the password that was hashed", async () => {
    const stored = await hashPassword("correct-horse");
    expect(await verifyPassword("correct-horse", stored)).toBe(true);
    expect(await verifyPassword("wrong-horse", stored)).toBe(false);
  });

  it("rejects a malformed stored hash", async () => {
    expect(await verifyPassword("correct-horse", "nope")).toBe(false);
  });
});
