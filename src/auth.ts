import type { JwtPayload, Secret } from "jsonwebtoken";
import type { NextFunction, Response as ExpressResponse } from 'express';
import { expressJwtSecret } from 'jwks-rsa';
import { expressjwt, type IsRevoked, type Request as JWTRequest } from "express-jwt";

const ISSUER = process.env.TOKEN_ISSUER || "http://localhost:4646";
const AUDIENCE = process.env.TOKEN_AUDIENCES || 'my\\-[a-z]+';
const ACCESS_TOKEN_NAME = process.env.ACCESS_TOKEN_NAME || 'access_token';

/**
 * Callback function to check if a JWT token has been revoked.
 * This function checks the token's `jti` claim against a revocation list.
 * If the token is revoked, it returns true; otherwise, it returns false.
 *
 * @param _req the Express request object (not used in this function)
 * @param token the JWT payload to check for revocation
 * @returns a promise that resolves to true if the token is revoked, false otherwise
 */
const isRevokedCallback: IsRevoked = async (
  _req: JWTRequest,
  token: JwtPayload | undefined
): Promise<boolean> => {
  if (!token || !token.payload) {
    return true; // Revoke/reject if payload is missing
  }

  const payload: JwtPayload = typeof token.payload === 'string' ? JSON.parse(token.payload) : token.payload;
  const jti = payload.jti as string;
  if (!jti) {
    return true; // Revoke/reject if jti is missing
  }

  // Call the issuer's revocation check endpoint with the jti to see if it has been revoked
  const revocationCheckURL = `${ISSUER}//revocations/${jti}`;
  const response: Response = await fetch(revocationCheckURL);
  return response.status === 200 || response.status === 400;
}

/**
 * Extracts the JWT token from the request, either from the cookie or the Authorization header.
 *
 * @param req the Express request object, which may contain the JWT token in cookies or headers
 * @returns the JWT token string if found, or null if not found
 */
const getToken = (req: JWTRequest) => {
  // Check for the token in the cookie first
  if (req.cookies && req.cookies[ACCESS_TOKEN_NAME]) {
    return req.cookies[ACCESS_TOKEN_NAME];
  }

  // If not found in cookies, check the Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return req.headers.authorization.split(' ')[1];
  }

  return null;
}

/**
 * Express middleware to validate the custom claims in the JWT payload.
 * This middleware checks that the JWT payload contains the expected claims with
 * the correct types.
 *
 * If any claim is missing or has an invalid type, the request is rejected with
 * a 401 Unauthorized response.
 *
 * @param req the Express request object, which should have the JWT payload in `req.auth`
 * @param res the Express response object
 * @param next the next middleware function to call if the claims are valid
 */
export const validateClaims = (
  req: JWTRequest,
  res: ExpressResponse,
  next: NextFunction
) => {
  const payload: JwtPayload | undefined = req.auth;
  if (
    payload && (
      typeof payload.id !== 'string'
      || typeof payload.email !== 'string'
      || typeof payload.givenName !== 'string'
      || typeof payload.surName !== 'string'
      || typeof payload.affiliationId !== 'string'
      || typeof payload.languageId !== 'string'
      || typeof payload.role !== 'string'
      || typeof payload.jti !== 'string'
      || typeof payload.tokenVersion !== 'number')
  ) {

    return res.status(401).json({ error: 'Access token has invalid custom claims' });
  }

  next();
};

/**
 * Express middleware to require authentication using JWT tokens.
 * This middleware checks for a JWT token in the 'dmspt' cookie or the authorization header.
 *
 * If the token is valid, the request proceeds; otherwise, it is rejected with a
 * 401 Unauthorized response.
 */
export const requireAuth = expressjwt({
  secret: expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `${ISSUER}/jwks`,
  }) as unknown as Secret, // Type cast required for express-jwt secret compatibility
  audience: new RegExp(AUDIENCE),
  issuer: ISSUER,
  algorithms: ['RS256'],
  credentialsRequired: false, // Setting to false allows access to queries that don't require auth
  getToken: getToken,
  isRevoked: isRevokedCallback
});
