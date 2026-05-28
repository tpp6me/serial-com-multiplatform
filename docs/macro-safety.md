# Macro Safety

Macros automate repeated sends. Treat macros as device-control operations, not text snippets.

## Safety Rules

- Keep destructive device commands out of default macros.
- Use pacing for repeated sends.
- Verify line endings before sending to firmware shells or bootloaders.
- Prefer explicit hex mode for binary device protocols.
- Keep automation rate limits enabled.

## Review Checklist

Before sharing a macro set, confirm:

- Target device and firmware version.
- Expected serial settings.
- Whether commands change persistent device state.
- Required delays between commands.
- Recovery steps if the command sequence is interrupted.
