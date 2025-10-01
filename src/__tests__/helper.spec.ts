import { safeNumber, safeBoolean, pointsToFontSize, formatDate } from "../helper";

describe("safeNumber", () => {
  it("parses valid numbers", () => {
    expect(safeNumber("42", 0)).toBe(42);
    expect(safeNumber("3.14", 0)).toBeCloseTo(3.14);
  });

  it("returns fallback on invalid numbers", () => {
    expect(safeNumber("abc", 99)).toBe(99);
    expect(safeNumber("", 5)).toBe(5);
    expect(safeNumber("   ", 1)).toBe(1);
    expect(safeNumber(undefined, 12)).toBe(12);
  });
});

describe("safeBoolean", () => {
  it("returns true for accepted truthy strings", () => {
    ["1", "on", "true", "yes"].forEach((val) => {
      expect(safeBoolean(val, false)).toBe(true);
      expect(safeBoolean(val.toUpperCase(), false)).toBe(true);
    });
  });

  it("returns false for accepted falsy strings", () => {
    ["0", "off", "false", "no"].forEach((val) => {
      expect(safeBoolean(val, true)).toBe(false);
      expect(safeBoolean(val.toUpperCase(), true)).toBe(false);
    });
  });

  it("returns fallback for unrecognized strings", () => {
    expect(safeBoolean("maybe", true)).toBe(true);
    expect(safeBoolean("unknown", false)).toBe(false);
  });

  it("handles undefined or null gracefully", () => {
    expect(safeBoolean(undefined as any, true)).toBe(true);
    expect(safeBoolean(null as any, false)).toBe(false);
  });
});

describe("pointsToFontSize", () => {
  it("maps known point sizes to expected pixel values", () => {
    expect(pointsToFontSize(8)).toBe("11px");
    expect(pointsToFontSize(9)).toBe("12px");
    expect(pointsToFontSize(10)).toBe("13px");
    expect(pointsToFontSize(12)).toBe("16px");
    expect(pointsToFontSize(13)).toBe("17px");
    expect(pointsToFontSize(14)).toBe("19px");
  });

  it("returns default size for unknown values", () => {
    expect(pointsToFontSize(7)).toBe("15px");
    expect(pointsToFontSize(11)).toBe("15px");
    expect(pointsToFontSize(20)).toBe("15px");
  });
});

describe("formatDate", () => {
  it("formats valid ISO date with day included", () => {
    const result = formatDate("2020-01-15T20:21:22Z", true);
    expect(result).toMatch(/January.*2020/); // locale may vary slightly

    // A date without a time will always be assumed to be at 00:00:00 UTC
    const result2 = formatDate("2020-01-15", true);
    expect(result2).toMatch(/January.*2020/); // locale may vary slightly

    const result3 = formatDate("2020-01-15T00:00:00Z", true);
    expect(result3).toMatch(/January.*2020/); // locale may vary slightly
  });

  it("formats valid ISO date without day", () => {
    const result = formatDate("2020-01-15", false);
    expect(result).toMatch(/January.*2020/);
  });

  it("returns 'None specified' for invalid date", () => {
    const result = formatDate("not-a-date");
    expect(result).toBe("None specified");
  });
});
