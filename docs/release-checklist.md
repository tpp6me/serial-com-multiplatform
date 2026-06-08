# Release Checklist

## Local Gates

Run these before packaging:

```bash
corepack pnpm check:env
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm rust:fmt
corepack pnpm rust:clippy
corepack pnpm rust:test
corepack pnpm build
```

## Packaging Gates

- Generate icons with `corepack pnpm icons:generate`.
- Generate notices with `corepack pnpm notices:generate`.
- Build macOS app and DMG artifacts.
- Build Windows NSIS artifacts on Windows.
- Build Linux AppImage and `.deb` artifacts on Linux.
- Verify bundled `LICENSE` and `THIRD_PARTY_NOTICES.md`.

## Signing Gates

- Updater: set `TAURI_SIGNING_PRIVATE_KEY` in the release environment. Keep the private key out of git.
- macOS: Apple Developer signing identity, hardened runtime, notarization, and Gatekeeper launch. See [macOS signing recipe](#macos-signing-notarizing-and-stapling) below.
- Windows: EV certificate/signing command, timestamp server, and installer reputation path.
- Linux: package install and serial permissions behavior.

### macOS: Signing, Notarizing, and Stapling

This is the verified end-to-end recipe for producing a distributable, Gatekeeper-accepted DMG. It deliberately builds the DMG with `hdiutil` instead of Tauri's `bundle_dmg.sh`, because that script's Finder "prettify" AppleScript step requires Automation permission and fails in many environments. The trade-off is losing the decorative DMG background/icon layout; the artifact is otherwise identical and fully notarized.

**One-time machine setup (per Mac):**

1. **Developer ID Application certificate** in the login keychain (create via Xcode → Settings → Accounts → Manage Certificates → `+` → *Developer ID Application*, or via the Apple Developer portal with a CSR). Confirm with `security find-identity -v -p codesigning` and note its SHA-1 fingerprint.
2. **Notary keychain profile** holding an app-specific password (from appleid.apple.com → App-Specific Passwords):
   ```bash
   xcrun notarytool store-credentials "multiserial-notary" \
     --apple-id "<apple-id-email>" --team-id "<TEAM_ID>" --password "<app-specific-password>"
   ```

The signing identity SHA-1 and the `multiserial-notary` profile are machine-local — they are not in git and must be recreated on each release Mac.

**Build → sign → notarize → staple.** Run from this directory, in sequence. Replace `<version>` and `<SIGNING_IDENTITY_SHA1>`:

```bash
ID="<SIGNING_IDENTITY_SHA1>"
APP="src-tauri/target/release/bundle/macos/MultiSerial.app"
OUT="src-tauri/target/release/bundle/dmg/MultiSerial_<version>_aarch64.dmg"

# 1. Build + sign the .app. Env vars MUST be inline on the same command — they do
#    not persist across separate shell invocations. Build app-only to skip the
#    flaky bundle_dmg.sh. TAURI_SIGNING_PRIVATE_KEY only satisfies the updater
#    artifact requirement (createUpdaterArtifacts=true); it is unrelated to Apple
#    signing — use the production updater key for real releases, not the dev key.
APPLE_SIGNING_IDENTITY="$ID" \
TAURI_SIGNING_PRIVATE_KEY="$(cat .dev-data/updater-dev.key)" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
corepack pnpm exec node scripts/run-with-dev-env.mjs tauri build --bundles app

# 2. Notarize the app, then staple it (so offline first-launch works).
ditto -c -k --keepParent "$APP" /tmp/multiserial-notarize.zip
xcrun notarytool submit /tmp/multiserial-notarize.zip --keychain-profile "multiserial-notary" --wait
xcrun stapler staple "$APP"

# 3. Build the DMG from the stapled app, sign it, notarize and staple the DMG.
STAGE=$(mktemp -d); cp -R "$APP" "$STAGE/"; ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "MultiSerial" -srcfolder "$STAGE" -ov -format UDZO "$OUT"; rm -rf "$STAGE"
codesign --force --sign "$ID" --timestamp "$OUT"
xcrun notarytool submit "$OUT" --keychain-profile "multiserial-notary" --wait
xcrun stapler staple "$OUT"
```

**Verify (must pass before shipping):**

```bash
codesign --verify --strict --verbose=2 "$APP"      # app: valid, satisfies Designated Requirement
codesign -dvvv "$APP" 2>&1 | grep -iE "Authority|TeamIdentifier|flags|Timestamp"
                                                    # expect Developer ID Application, TeamIdentifier set,
                                                    # flags=...(runtime), Timestamp present
xcrun stapler validate "$OUT"                       # "The validate action worked!"
spctl -a -t open --context context:primary-signature -v "$OUT"
                                                    # "accepted" / "source=Notarized Developer ID"
```

The first `codesign` use of the key may trigger a keychain dialog ("codesign wants to sign using key…") — click **Always Allow**. The output DMG is `aarch64`-only; produce a separate `x86_64` (or universal) build for Intel Macs.

## Updater Gates

- Publish a signed updater manifest for each release channel.
- Verify `stable`, `beta`, and `nightly` targets route to the intended manifest.
- Verify auto-check reports current, available, and error states.
- Verify auto-download downloads but does not install without an explicit install action.

## Hardware Gates

Run loopback and hotplug tests for each adapter in the approved hardware matrix before release.
