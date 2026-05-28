export type ShortcutActionId =
  | "connectToggle"
  | "clearTerminal"
  | "search"
  | "exportText"
  | "newTab"
  | "closeTab"
  | "toggleMacros"
  | "toggleFilters"
  | "settings"
  | "refreshPorts";

export type ShortcutDefinition = {
  id: ShortcutActionId;
  label: string;
  defaultBinding: string;
};

export type ShortcutBindings = Record<ShortcutActionId, string>;

export type ShortcutValidationResult =
  | { ok: true; value: ShortcutBindings }
  | { ok: false; errors: string[] };

export const SHORTCUT_STORAGE_KEY = "multiserial.shortcuts.v1";

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: "connectToggle", label: "Connect or disconnect", defaultBinding: "Mod+K" },
  { id: "clearTerminal", label: "Clear terminal", defaultBinding: "Mod+L" },
  { id: "search", label: "Search terminal", defaultBinding: "Mod+F" },
  { id: "exportText", label: "Export text buffer", defaultBinding: "Mod+Shift+S" },
  { id: "newTab", label: "New tab", defaultBinding: "Mod+T" },
  { id: "closeTab", label: "Close tab", defaultBinding: "Mod+W" },
  { id: "toggleMacros", label: "Toggle macros panel", defaultBinding: "Mod+Shift+M" },
  { id: "toggleFilters", label: "Toggle filter panel", defaultBinding: "Mod+Shift+F" },
  { id: "settings", label: "Settings", defaultBinding: "Mod+," },
  { id: "refreshPorts", label: "Refresh ports", defaultBinding: "F5" }
];

const reservedShortcuts = new Set(["Mod+Q", "Mod+Tab", "Mod+Space", "Mod+H", "Mod+M"]);

export function defaultShortcutBindings(): ShortcutBindings {
  return Object.fromEntries(
    SHORTCUT_DEFINITIONS.map((definition) => [definition.id, definition.defaultBinding])
  ) as ShortcutBindings;
}

export function loadShortcutBindings(storage: Storage | null): ShortcutBindings {
  const defaults = defaultShortcutBindings();

  if (!storage) {
    return defaults;
  }

  try {
    const raw = storage.getItem(SHORTCUT_STORAGE_KEY);
    if (!raw) {
      return defaults;
    }

    const parsed = JSON.parse(raw) as Partial<Record<ShortcutActionId, string>>;
    return normalizeShortcutBindings({ ...defaults, ...parsed });
  } catch {
    return defaults;
  }
}

export function saveShortcutBindings(storage: Storage | null, bindings: ShortcutBindings) {
  if (!storage) {
    return;
  }

  storage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(bindings));
}

export function validateShortcutBindings(bindings: ShortcutBindings): ShortcutValidationResult {
  const normalized = normalizeShortcutBindings(bindings);
  const errors: string[] = [];
  const seen = new Map<string, string>();

  for (const definition of SHORTCUT_DEFINITIONS) {
    const binding = normalized[definition.id];

    if (!binding) {
      errors.push(`${definition.label} shortcut is required.`);
      continue;
    }

    if (reservedShortcuts.has(binding)) {
      errors.push(`${definition.label} uses OS-reserved shortcut ${binding}.`);
    }

    const existing = seen.get(binding);
    if (existing) {
      errors.push(`${definition.label} conflicts with ${existing} on ${binding}.`);
    } else {
      seen.set(binding, definition.label);
    }
  }

  return errors.length === 0 ? { ok: true, value: normalized } : { ok: false, errors };
}

export function normalizeShortcutBindings(bindings: ShortcutBindings): ShortcutBindings {
  return Object.fromEntries(
    SHORTCUT_DEFINITIONS.map((definition) => [
      definition.id,
      normalizeShortcut(bindings[definition.id] ?? definition.defaultBinding)
    ])
  ) as ShortcutBindings;
}

export function normalizeShortcut(binding: string): string {
  const parts = binding
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const modifiers = new Set<string>();
  let key = "";

  for (const part of parts) {
    const token = part.toLowerCase();
    if (["cmd", "command", "ctrl", "control", "mod"].includes(token)) {
      modifiers.add("Mod");
    } else if (token === "shift") {
      modifiers.add("Shift");
    } else if (token === "alt" || token === "option") {
      modifiers.add("Alt");
    } else {
      key = normalizeKeyName(part);
    }
  }

  if (!key) {
    return "";
  }

  return [...["Mod", "Shift", "Alt"].filter((modifier) => modifiers.has(modifier)), key].join("+");
}

export function matchesShortcut(event: KeyboardEvent, binding: string): boolean {
  const normalized = normalizeShortcut(binding);

  if (!normalized) {
    return false;
  }

  const parts = normalized.split("+");
  const key = parts[parts.length - 1];
  const wantsMod = parts.includes("Mod");
  const wantsShift = parts.includes("Shift");
  const wantsAlt = parts.includes("Alt");

  return (
    normalizeKeyName(event.key) === key &&
    (event.metaKey || event.ctrlKey) === wantsMod &&
    event.shiftKey === wantsShift &&
    event.altKey === wantsAlt
  );
}

function normalizeKeyName(key: string): string {
  if (key === " ") {
    return "Space";
  }

  if (key.length === 1) {
    return key.toUpperCase();
  }

  return key[0].toUpperCase() + key.slice(1);
}
