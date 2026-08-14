# AI-Plugin

Local Grok (xAI) or Codex (OpenAI / ChatGPT) inside Discord. The plugin uses the CLI already signed in on your machine — no extra API key, no tokens in the renderer.

Works on **Discord Desktop** and **Vesktop**. It does not run in Vencord Web.

---

## Features

| Area | What you get |
| --- | --- |
| Chat bar | AI button next to GIF / sticker / Nitro |
| Messages | Hover action and context-menu item: **Explain with AI** |
| Commands | `/grok` (optional question), `/grokupdate` |
| History | Per-channel and per-DM conversation, persisted locally |
| Context | Optional Discord transcript for summaries and explanations |
| Providers | Grok CLI or Codex CLI, switched in settings |
| Models | Provider-specific list (Grok 4.6 / 4.5, GPT-5.6 Sol–Luna, GPT-5.5 / 5.4) |
| Language | English (default), Magyar, Deutsch, Español |
| Icon | Default, Grok, OpenAI, Atom, or a custom SVG (`currentColor`) |

---

## Requirements

| Provider | What you need |
| --- | --- |
| Grok | [Grok CLI](https://x.ai/cli) and `grok login` (SuperGrok / X Premium+) |
| Codex | ChatGPT / Codex desktop app or `npm i -g @openai/codex`, then `codex login` |

Verify Grok:

```powershell
irm https://x.ai/cli/install.ps1 | iex
grok login
grok models
```

A line like `You are logged in with grok.com.` means the plugin can attach.

Codex uses `%USERPROFILE%\.codex\auth.json` (ChatGPT session). Tokens stay on disk and are never forwarded to Discord’s renderer.

You also need an Equicord or Vencord **source tree**. The installer `.asar` cannot load userplugins.

---

## Install

### One command (Windows Command Prompt)

Close Discord. Open **cmd.exe** (not PowerShell) and paste:

```bat
cd /d "%USERPROFILE%\Documents\GitHub" && if not exist Equicord git clone https://github.com/Equicord/Equicord.git && cd Equicord && if not exist src\userplugins mkdir src\userplugins && if not exist src\userplugins\grokAi git clone https://github.com/TheRealMagyar/Vencord-ai-plugin.git src\userplugins\grokAi && (bun install || corepack pnpm@11.20.0 install) && bun run build && taskkill /F /IM Discord.exe 2>nul & set EQUICORD_USER_DATA_DIR=%CD%&& set EQUICORD_DIRECTORY=%CD%\dist\desktop&& set EQUICORD_DEV_INSTALL=1&& bun run inject -- -install -branch stable
```

Notes:

- If `bun install` fails on Equicord `link:` packages, the command falls back to Corepack pnpm. No global pnpm install is required.
- Do not use `mkdir … -Force` in cmd. `-Force` is a PowerShell flag and creates a folder named `-Force`.

### Manual (PowerShell)

```powershell
cd $env:USERPROFILE\Documents\GitHub\Equicord
mkdir src\userplugins -Force
git clone https://github.com/TheRealMagyar/Vencord-ai-plugin.git src\userplugins\grokAi
```

Use the `Vencord` repo instead of `Equicord` if that is your client.

Then, from the Equicord / Vencord root, pick **one** package manager:

```powershell
bun install
bun run build
bun run inject
```

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run inject
```

```powershell
corepack pnpm@11.20.0 install
corepack pnpm@11.20.0 run build
corepack pnpm@11.20.0 run inject
```

On Windows PowerShell the `npm` shim is often blocked by execution policy. Use `npm.cmd`.

If inject is interactive or fails, close Discord and run:

```powershell
$env:EQUICORD_USER_DATA_DIR = "$pwd"
$env:EQUICORD_DIRECTORY = "$pwd\dist\desktop"
$env:EQUICORD_DEV_INSTALL = "1"
.\dist\Installer\EquilotlCli.exe -install -branch stable
```

If `resources\app.asar` is a directory, set `index.js` to:

```js
require("C:\\Users\\User\\Equicord\\dist\\desktop\\patcher.js");
```

Start Discord → **Settings → Plugins → AI-Plugin → Enable**.

---

## Update

Close Discord, then:

```bat
cd /d "%USERPROFILE%\Documents\GitHub\Equicord" && git -C src\userplugins\grokAi fetch origin && git -C src\userplugins\grokAi reset --hard origin/main && (bun run build || corepack pnpm@11.20.0 run build)
```

If the tree lives at `C:\Users\User\Equicord`:

```bat
cd /d "%USERPROFILE%\Equicord" && git -C src\userplugins\grokAi fetch origin && git -C src\userplugins\grokAi reset --hard origin/main && (bun run build || corepack pnpm@11.20.0 run build)
```

`git reset --hard` makes GitHub win over local edits in the plugin folder.

The plugin can also update itself on Discord startup (`autoUpdate`). Manual options: plugin settings → **Update now**, or `/grokupdate`. Restart Discord after a successful update.

---

## Configuration

| Setting | Description |
| --- | --- |
| Provider | Grok (xAI) or Codex (OpenAI / ChatGPT) |
| AI icon | Sparkle, Grok, OpenAI, ChatGPT, Codex, Orbit, or custom SVG |
| Language | English, Magyar, Deutsch, Español |
| Grok / Codex model | Shown only for the active provider |
| Allow web search | Grok only |
| Include channel context | Attach Discord history for summaries and explain |
| Grok / Codex path | Optional override if auto-detect fails |
| Auto update | Pull from GitHub when Discord starts |

### Icon

**AI icon** has six built-in marks: Sparkle, Grok / xAI, OpenAI, ChatGPT, Codex / terminal, and Orbit.

**Custom SVG** shows an extra field. Paste either a full document:

```svg
<svg viewBox="0 0 24 24">
  <path d="M12 2 15 9 22 12 15 15 12 22 9 15 2 12 9 9Z"/>
</svg>
```

or a single shape:

```svg
<path d="M12 2 15 9 22 12 15 15 12 22 9 15 2 12 9 9Z"/>
```

The icon is tinted with Discord’s `currentColor`. Scripts, event handlers, and external images are stripped.

---

## How it connects

`native.ts` runs in Electron’s main process:

1. Resolves the CLI from the setting, the default install path, then `PATH`.
2. Reads local login metadata from `auth.json`. Access tokens are never sent to the renderer.
3. Runs a headless turn in an isolated temp directory (`grok --prompt-file` or `codex exec --json`), with file/shell tools disabled.

Sessions are resumed per channel and per provider (`--resume` / `codex exec resume`).

---

## Troubleshooting

| Symptom | What to try |
| --- | --- |
| CLI not installed | Install Grok or Codex, then restart Discord |
| No active subscription | `grok login` or `codex login` |
| No chat-bar button | Enable **AI-Plugin**; confirm Chat Input Button API is on; restart after build |
| Inject / `app.asar` errors | Close Discord completely (tray included) and inject again |
| bun cannot link `@vencord/discord-types` | Use `corepack pnpm@11.20.0 install` |

Desktop and Vesktop only.

---

## License

GPL-3.0-or-later, as required for Vencord plugins.
