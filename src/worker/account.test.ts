import { describe, expect, it } from "vitest";
import { parseLogin, parsePasswordChange } from "./account";
import { HttpError, readCookie, sessionCookie } from "./http";

describe("account input", () => {
  it("normalizes the login email", () => {
    expect(parseLogin({ email: " Ada@Example.com ", password: "long-enough" })).toEqual({
      email: "ada@example.com",
      password: "long-enough",
    });
  });

  it("rejects a bad email and a short new password", () => {
    expect(() => parseLogin({ email: "not-an-email", password: "long-enough" })).toThrow("请填写邮箱和密码");
    expect(() => parsePasswordChange({ currentPassword: "long-enough", nextPassword: "short" })).toThrow(HttpError);
  });
});

describe("session cookie", () => {
  it("reads the session token back out of a cookie header", () => {
    const header = sessionCookie("abc", false);
    expect(readCookie(header, "mytodo_session")).toBe("abc");
    expect(header).not.toContain("Secure");
    expect(sessionCookie("abc", true)).toContain("Secure");
  });
});
