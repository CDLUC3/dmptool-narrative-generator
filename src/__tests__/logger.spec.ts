import pino, { Logger } from "pino";
import {
  initLogger,
  prepareObjectForLogs,
  LoggerContext,
} from "../logger";

describe("logger module", () => {
  describe("prepareObjectForLogs", () => {
    it("removes undefined and null fields", () => {
      const input = { a: 1, b: undefined, c: null, d: "ok" };
      const result = prepareObjectForLogs(input);
      expect(result).toEqual({ a: 1, d: "ok" });
    });

    it("returns empty object if all values are undefined or null", () => {
      const input = { a: undefined, b: null };
      const result = prepareObjectForLogs(input);
      expect(result).toEqual({});
    });

    it("keeps falsy but valid values (false, 0, '')", () => {
      const input = { a: false, b: 0, c: "" };
      const result = prepareObjectForLogs(input);
      expect(result).toEqual({ a: false, b: 0, c: "" });
    });
  });

  describe("initLogger", () => {
    let baseLogger: Logger;

    beforeEach(() => {
      baseLogger = pino({ level: "silent" });
    });

    it("returns a child logger with provided context", () => {
      const context: LoggerContext = {
        app: "my-app",
        env: "test",
        requestId: "req-123",
        userId: 42,
      };

      const childSpy = jest.spyOn(baseLogger, "child");
      const childLogger = initLogger(baseLogger, context);

      expect(childSpy).toHaveBeenCalledWith({
        app: "my-app",
        env: "test",
        requestId: "req-123",
        userId: 42,
      });
      expect(childLogger).toBeDefined();
    });

    it("filters out undefined fields in context", () => {
      const context: LoggerContext = {
        app: "my-app",
        env: "test",
        jti: undefined,
      };

      const childSpy = jest.spyOn(baseLogger, "child");
      initLogger(baseLogger, context);

      expect(childSpy).toHaveBeenCalledWith({
        app: "my-app",
        env: "test",
      });
    });

    it("returns base logger if child creation fails", () => {
      const badLogger = {
        child: () => {
          throw new Error("child failed");
        },
      } as unknown as Logger;

      const result = initLogger(badLogger, { app: "app", env: "test" });
      expect(result).toBe(badLogger);
    });
  });
});
