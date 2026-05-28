import { describe, expect, it } from "vitest";

const contrastPairs = [
  ["dark app text", "#e8edf2", "#101418"],
  ["dark muted text", "#9aa8b5", "#101418"],
  ["dark terminal text", "#dbe3ea", "#0b0f13"],
  ["dark tx text", "#9be7b0", "#0b0f13"],
  ["light app text", "#17202a", "#f7f9fb"],
  ["light muted text", "#51606f", "#f7f9fb"],
  ["light terminal text", "#17202a", "#ffffff"],
  ["light tx text", "#1d6b32", "#ffffff"]
] as const;

describe("theme contrast", () => {
  it("keeps core foreground/background pairs at WCAG AA contrast", () => {
    for (const [label, foreground, background] of contrastPairs) {
      expect(contrastRatio(foreground, background), label).toBeGreaterThanOrEqual(4.5);
    }
  });
});

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = color
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
