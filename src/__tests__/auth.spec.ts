import { describe, expect, it, jest } from "@jest/globals";

const mockExpressJwtSecret = jest.fn(() => "jwks-secret");
const mockExpressJwt = jest.fn((options) => options);

jest.unstable_mockModule("jwks-rsa", () => ({
  expressJwtSecret: mockExpressJwtSecret,
}));
jest.unstable_mockModule("express-jwt", () => ({
  expressjwt: mockExpressJwt,
}));

const { requireAuth, validateClaims } = await import("../auth.js");
const authOptions = requireAuth as unknown as {
  getToken: (request: { cookies?: Record<string, string>; headers: { authorization?: string } }) => string | null;
  isRevoked: (_request: unknown, token?: { payload?: string | { jti?: string } }) => Promise<boolean>;
};

describe("auth middleware", () => {
  it("configures JWT verification with the expected JWKS settings", () => {
    expect(mockExpressJwtSecret).toHaveBeenCalledWith({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: "http://localhost:4646/jwks",
    });
    expect(mockExpressJwt).toHaveBeenCalledWith(expect.objectContaining({
      algorithms: ["RS256"],
      credentialsRequired: false,
      issuer: "http://localhost:4646",
    }));
  });

  it("extracts cookie tokens before bearer tokens and returns null when absent", () => {
    expect(authOptions.getToken({
      cookies: { access_token: "cookie-token" },
      headers: { authorization: "Bearer header-token" },
    })).toBe("cookie-token");
    expect(authOptions.getToken({ headers: { authorization: "Bearer header-token" } })).toBe("header-token");
    expect(authOptions.getToken({ headers: { authorization: "Basic credentials" } })).toBeNull();
  });

  it("rejects missing token payloads and payloads without a jti", async () => {
    await expect(authOptions.isRevoked({}, undefined)).resolves.toBe(true);
    await expect(authOptions.isRevoked({}, { payload: {} })).resolves.toBe(true);
  });

  it("checks string and object payload jtis against the revocation endpoint", async () => {
    const fetchMock = jest.spyOn(global, "fetch")
      .mockResolvedValueOnce({ status: 200 } as Response)
      .mockResolvedValueOnce({ status: 400 } as Response)
      .mockResolvedValueOnce({ status: 404 } as Response);

    await expect(authOptions.isRevoked({}, { payload: '{"jti":"string-jti"}' })).resolves.toBe(true);
    await expect(authOptions.isRevoked({}, { payload: { jti: "object-jti" } })).resolves.toBe(true);
    await expect(authOptions.isRevoked({}, { payload: { jti: "active-jti" } })).resolves.toBe(false);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "http://localhost:4646//revocations/string-jti");
  });

  it("accepts valid claims and rejects invalid claims", () => {
    const next = jest.fn();
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const validClaims = {
      id: "id",
      email: "user@example.com",
      givenName: "User",
      surName: "Example",
      affiliationId: "affiliation",
      languageId: "en",
      role: "RESEARCHER",
      jti: "jti",
      tokenVersion: 1,
    };

    validateClaims({ auth: validClaims } as never, { status } as never, next);
    validateClaims({ auth: { ...validClaims, tokenVersion: "1" } } as never, { status } as never, next);
    validateClaims({} as never, { status } as never, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: "Access token has invalid custom claims" });
  });
});
