import { describe, expect, it } from "vitest";
import { parseLogin, parseRegister } from "./account";
import { HttpError, readCookie, sessionCookie } from "./http";

describe("account input", () => {
  it("normalizes a registration", () => {
    expect(parseRegister({ email: " Ada@Example.com ", name: " 阿达 ", password: "long-enough" })).toEqual({
      email: "ada@example.com",
      name: "阿达",
      password: "long-enough",
    });
  });

  it("rejects a short password and a bad email", () => {
    expect(() => parseRegister({ email: "ada@example.com", name: "阿达", password: "short" })).toThrow(HttpError);
    expect(() => parseLogin({ email: "not-an-email", password: "long-enough" })).toThrow("请填写邮箱和密码");
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
