import { describe, expect, it } from "vitest";
import { formatCurrency, formatNumber, initialsFromName } from "./format";

describe("formatNumber", () => {
  it("adds thousands separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("handles zero and small numbers", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(42)).toBe("42");
  });
});

describe("formatCurrency", () => {
  it("formats as USD with at least 2 decimal places", () => {
    expect(formatCurrency(12.5)).toBe("$12.50");
  });

  it("keeps small fractional costs visible instead of rounding to $0.00", () => {
    expect(formatCurrency(0.0034)).toBe("$0.0034");
  });
});

describe("initialsFromName", () => {
  it("takes the first letter of up to two words", () => {
    expect(initialsFromName("Arjun Analyst")).toBe("AA");
  });

  it("handles a single word", () => {
    expect(initialsFromName("Aisha")).toBe("A");
  });

  it("ignores extra whitespace", () => {
    expect(initialsFromName("  Vik   Viewer  ")).toBe("VV");
  });
});
