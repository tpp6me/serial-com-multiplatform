import { describe, expect, it } from "vitest";
import {
  defaultShortcutBindings,
  matchesShortcut,
  validateShortcutBindings
} from "./shortcutModel";

describe("shortcutModel", () => {
  it("accepts the default shortcuts", () => {
    expect(validateShortcutBindings(defaultShortcutBindings()).ok).toBe(true);
  });

  it("detects duplicate bindings", () => {
    const bindings = defaultShortcutBindings();
    bindings.clearTerminal = bindings.connectToggle;
    const result = validateShortcutBindings(bindings);

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors[0]).toContain("conflicts");
  });

  it("rejects OS-reserved shortcuts", () => {
    const bindings = defaultShortcutBindings();
    bindings.connectToggle = "Mod+Q";
    const result = validateShortcutBindings(bindings);

    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.errors[0]).toContain("OS-reserved");
  });

  it("matches keyboard events against normalized bindings", () => {
    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true });

    expect(matchesShortcut(event, "cmd+k")).toBe(true);
    expect(matchesShortcut(event, "Mod+Shift+K")).toBe(false);
  });

  it("matches space key shortcuts", () => {
    const event = new KeyboardEvent("keydown", { key: " ", metaKey: true });

    expect(matchesShortcut(event, "Mod+Space")).toBe(true);
  });
});
