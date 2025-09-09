import { JWTAccessToken } from "../server";
import {Logger} from "pino";
import {AccessibleDMP} from "../mysql";

// Mock the logger
jest.mock('../logger', () => {
  const original = jest.requireActual('../logger') as typeof import('../logger');

  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  };

  return {
    ...original, // Keep all original exports
    // Override the actual write functions for the pino logger and its ability to spawn
    logger: {
      ...mockLogger,
      child: jest.fn().mockReturnValue(mockLogger),
    }
  };
});

// Mock the DynamoDB
jest.mock('../dynamo', () => {
  const original = jest.requireActual('../dynamo') as typeof import('../dynamo');
  return {
    ...original,
    getConnection: jest.fn().mockImplementation(async () => {
      return {
        release: jest.fn().mockImplementation(async () => { return true }),
        query: jest.fn().mockImplementation(async () => { return { Items: [] } }),
      }
    }),
    getDMP: jest.fn().mockImplementation(async (requestLogger: Logger, dmpId: string, version: string | null) => {
      return {
        dmpId,
        version,
        title: 'Test DMP',
        abstract: 'This is a test DMP',
        sections: [
          {}
        ]
      }
    })
  }
});

// Setup a getter and setter for the mock response from the MySQL getDMP function
let mockGetDMPResponse: AccessibleDMP[] = [];
export const setMockGetDMPResponse = (dmps: AccessibleDMP[]) => {
  mockGetDMPResponse = dmps;
}
export const getMockGetDMPResponse = () => {
  return mockGetDMPResponse;
}

// Mock the MySQL connection
jest.mock('../mysql');

// Generate a mock JWToken
export const mockToken = (
  args: JWTAccessToken
): JWTAccessToken => {
  return {
    id: args?.id ?? 123,
    givenName: args?.givenName ?? "Tester",
    surName: args?.surName ?? "Person",
    email: args?.email ?? "tester@example.com",
    affiliationId: args?.affiliationId ?? "https://ror.org/test",
    languageId: "en-US",
    role: args?.role ?? "RESEARCHER",
    jti: "456347456745677845677846",
    expiresIn: 12345,
  }
}
