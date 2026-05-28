import { encodeSendInput, type LineEnding } from "./sendModel";

export const MACRO_CONFIG_STORAGE_KEY = "multiserial.macroConfig.v1";

export type MacroStep =
  | {
      kind: "text";
      input: string;
      lineEnding: LineEnding;
    }
  | {
      kind: "hex";
      input: string;
    }
  | {
      kind: "delay";
      delayMs: number;
    };

export type SendMacro = {
  id: string;
  name: string;
  steps: MacroStep[];
};

export type SerializedMacroConfig = Record<string, SendMacro[]>;

export type MacroRunSegment =
  | {
      kind: "bytes";
      bytes: Uint8Array;
    }
  | {
      kind: "delay";
      delayMs: number;
    };

export type RunMacroOptions = {
  macro: SendMacro;
  writeBytes: (bytes: Uint8Array) => Promise<number>;
  wait?: (ms: number) => Promise<void>;
};

export class MacroConfigStore {
  private readonly macrosBySession = new Map<string, SendMacro[]>();

  constructor(initialConfig: SerializedMacroConfig = {}) {
    for (const [sessionId, macros] of Object.entries(initialConfig)) {
      this.macrosBySession.set(sessionId, macros.map(normalizeMacro));
    }
  }

  list(sessionId: string): SendMacro[] {
    return [...(this.macrosBySession.get(sessionId) ?? [])].map(copyMacro);
  }

  upsert(sessionId: string, macro: SendMacro): SendMacro {
    const normalized = normalizeMacro(macro);
    const macros = this.macrosBySession.get(sessionId) ?? [];
    const existingIndex = macros.findIndex((candidate) => candidate.id === normalized.id);

    if (existingIndex >= 0) {
      macros[existingIndex] = normalized;
    } else {
      macros.push(normalized);
    }

    this.macrosBySession.set(sessionId, macros);
    return copyMacro(normalized);
  }

  delete(sessionId: string, macroId: string): boolean {
    const macros = this.macrosBySession.get(sessionId) ?? [];
    const nextMacros = macros.filter((macro) => macro.id !== macroId);
    this.macrosBySession.set(sessionId, nextMacros);
    return nextMacros.length !== macros.length;
  }

  serialize(): SerializedMacroConfig {
    return Object.fromEntries(
      [...this.macrosBySession.entries()].map(([sessionId, macros]) => [
        sessionId,
        macros.map(copyMacro)
      ])
    );
  }
}

export function createMacroId(now = Date.now()): string {
  return `macro-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildMacroFromFields(fields: {
  id?: string;
  name: string;
  textInput: string;
  textLineEnding: LineEnding;
  hexInput: string;
  delayMs: number;
}): SendMacro {
  const steps: MacroStep[] = [];

  if (fields.textInput.length > 0) {
    steps.push({
      kind: "text",
      input: fields.textInput,
      lineEnding: fields.textLineEnding
    });
  }

  if (fields.hexInput.trim().length > 0) {
    steps.push({
      kind: "hex",
      input: fields.hexInput
    });
  }

  if (fields.delayMs > 0) {
    steps.push({
      kind: "delay",
      delayMs: fields.delayMs
    });
  }

  return {
    id: fields.id ?? createMacroId(),
    name: fields.name.trim() || "Macro",
    steps
  };
}

export function compileMacro(macro: SendMacro): MacroRunSegment[] {
  return macro.steps.map((step) => {
    if (step.kind === "delay") {
      if (!Number.isSafeInteger(step.delayMs) || step.delayMs < 0) {
        throw new Error("Macro delay must be a non-negative integer.");
      }

      return { kind: "delay", delayMs: step.delayMs };
    }

    const encoded = encodeSendInput(step.input, {
      mode: step.kind,
      lineEnding: step.kind === "text" ? step.lineEnding : "none"
    });

    if (!encoded.ok) {
      throw new Error(encoded.error);
    }

    return { kind: "bytes", bytes: encoded.bytes };
  });
}

export async function runMacro(options: RunMacroOptions) {
  const wait = options.wait ?? delay;

  for (const segment of compileMacro(options.macro)) {
    if (segment.kind === "delay") {
      await wait(segment.delayMs);
      continue;
    }

    const bytesWritten = await options.writeBytes(segment.bytes);

    if (bytesWritten !== segment.bytes.byteLength) {
      throw new Error(
        `macro stopped after partial write: ${bytesWritten}/${segment.bytes.byteLength}`
      );
    }
  }
}

export function loadMacroConfig(storage: Storage | null): SerializedMacroConfig {
  if (!storage) {
    return {};
  }

  try {
    const raw = storage.getItem(MACRO_CONFIG_STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    return isSerializedMacroConfig(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveMacroConfig(storage: Storage | null, config: SerializedMacroConfig) {
  if (!storage) {
    return;
  }

  storage.setItem(MACRO_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

function normalizeMacro(macro: SendMacro): SendMacro {
  return {
    id: macro.id,
    name: macro.name.trim() || "Macro",
    steps: macro.steps.map(normalizeStep)
  };
}

function normalizeStep(step: MacroStep): MacroStep {
  if (step.kind === "delay") {
    return {
      kind: "delay",
      delayMs: Math.max(0, Math.trunc(step.delayMs))
    };
  }

  if (step.kind === "hex") {
    return {
      kind: "hex",
      input: step.input
    };
  }

  return {
    kind: "text",
    input: step.input,
    lineEnding: step.lineEnding
  };
}

function copyMacro(macro: SendMacro): SendMacro {
  return {
    id: macro.id,
    name: macro.name,
    steps: macro.steps.map(normalizeStep)
  };
}

function isSerializedMacroConfig(value: unknown): value is SerializedMacroConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((macros) => Array.isArray(macros) && macros.every(isSendMacro));
}

function isSendMacro(value: unknown): value is SendMacro {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as SendMacro;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    Array.isArray(candidate.steps) &&
    candidate.steps.every(isMacroStep)
  );
}

function isMacroStep(value: unknown): value is MacroStep {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as MacroStep;

  if (candidate.kind === "text") {
    return (
      typeof candidate.input === "string" &&
      (candidate.lineEnding === "none" ||
        candidate.lineEnding === "cr" ||
        candidate.lineEnding === "lf" ||
        candidate.lineEnding === "crlf")
    );
  }

  if (candidate.kind === "hex") {
    return typeof candidate.input === "string";
  }

  return candidate.kind === "delay" && typeof candidate.delayMs === "number";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
