import { describe, expect, it } from "vitest";
import { decodeJwtPayload } from "./jwt";

function base64UrlEncode(json: unknown): string {
  const base64 = Buffer.from(JSON.stringify(json), "utf-8").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fakeJwt(payload: unknown): string {
  const header = base64UrlEncode({ alg: "HS256", typ: "JWT" });
  const body = base64UrlEncode(payload);
  return `${header}.${body}.fake-signature-not-verified`;
}

describe("decodeJwtPayload", () => {
  it("decodes a well-formed token's payload", () => {
    const payload = {
      sub: "user-analyst-001",
      email: "arjun.analyst@atqor.demo",
      name: "Arjun",
      role: "analyst",
      categories: ["general", "finance"],
      session_id: "abc-123",
      iat: 1700000000,
      exp: 1700100000,
    };
    const decoded = decodeJwtPayload(fakeJwt(payload));
    expect(decoded).toEqual(payload);
  });

  it("decodes unicode content correctly (not mangled by base64url handling)", () => {
    const payload = { sub: "user", email: "x@y.com", name: "Renée", role: "admin", categories: [], session_id: "s" };
    const decoded = decodeJwtPayload(fakeJwt(payload));
    expect(decoded?.name).toBe("Renée");
  });

  it("returns null for a malformed token", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
  });

  it("returns null for invalid base64/JSON in the payload segment", () => {
    expect(decodeJwtPayload("header.%%%not-base64%%%.sig")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(decodeJwtPayload("")).toBeNull();
  });
});
