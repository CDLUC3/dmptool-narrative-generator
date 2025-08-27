import { JWTAccessToken } from "../server";

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
    getDMP: jest.fn().mockImplementation(async (requestLogger: any, dmpId: string, version: string | null) => {
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
})

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
    dmpIds: args?.dmpIds ?? [],
    jti: "456347456745677845677846",
    expiresIn: 12345,
  }
}
