# AI-Plugin

Local Grok (xAI) or Codex (OpenAI / ChatGPT) inside Discord. The plugin uses the CLI already signed in on your machine — no extra API key, no tokens in the renderer.

Works on **Discord Desktop** and **Vesktop**. It does not run in Vencord Web.

![AI chat window](docs/screenshots/chat-window.png)

---

## Features

| Area | What you get |
| --- | --- |
| Chat bar | AI button next to GIF / sticker / Nitro |
| Messages | Hover action and context-menu item: **Explain with AI** |
| Commands | `/ai` (optional question), `/aiupdate` |
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

Verify Grok (PowerShell):

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

Use **cmd.exe**. Do not paste `$env:USERPROFILE` into cmd — that is PowerShell. venpm would save the `$env:...` text as the path and `git clone` would fail.

### venpm

[venpm](https://venpm.dev) clones the plugin into `src\userplugins\AI-Plugin` and rebuilds. Index: [Your First Plugin](https://venpm.dev/author/your-first-plugin.html).

Close Discord. Then:

```bat
npm.cmd install -g @kamaras/venpm
venpm doctor
venpm config set vencord.path %USERPROFILE%\Equicord
venpm repo add https://github.com/TheRealMagyar/Vencord-ai-plugin/releases/latest/download/plugins.json --name ai-plugin
venpm install AI-Plugin
```

If your tree is under Documents instead:

```bat
venpm config set vencord.path %USERPROFILE%\Documents\GitHub\Equicord
```

Vencord instead of Equicord: point `vencord.path` at that folder.

Then start Discord → **Settings → Plugins → AI-Plugin → Enable**.

### Manual

Only if you are not using venpm. Close Discord, then in cmd:

```bat
cd /d "%USERPROFILE%\Equicord"
if not exist src\userplugins mkdir src\userplugins
if not exist src\userplugins\AI-Plugin git clone https://github.com/TheRealMagyar/Vencord-ai-plugin.git src\userplugins\AI-Plugin
corepack pnpm@11.20.0 install
corepack pnpm@11.20.0 run build
```

If `bun` works on your tree, `bun install` and `bun run build` are fine. If bun cannot link `@vencord/discord-types`, use the `corepack pnpm@11.20.0` commands above.

Do not use `mkdir … -Force` in cmd. `-Force` is PowerShell and creates a folder named `-Force`.

If Discord is not injected yet:

```bat
cd /d "%USERPROFILE%\Equicord"
set EQUICORD_USER_DATA_DIR=%CD%
set EQUICORD_DIRECTORY=%CD%\dist\desktop
set EQUICORD_DEV_INSTALL=1
dist\Installer\EquilotlCli.exe -install -branch stable
```

If `resources\app.asar` is a directory, set `index.js` to:

```js
require("C:\\Users\\User\\Equicord\\dist\\desktop\\patcher.js");
```

Start Discord → **Settings → Plugins → AI-Plugin → Enable**.

---

## Screenshots

### Chat bar

AI button next to GIF / sticker / Nitro.

![Chat bar AI button](docs/screenshots/chat-bar.png)

### Chat window

Per-channel history. Grok or Codex, via the CLI already signed in on your machine.

![AI chat window](docs/screenshots/chat-window.png)

### Explain with AI

Message hover action and context menu.

![Explain with AI](docs/screenshots/explain.png)

### Settings

Provider, model, language, icon, and updates.

![Plugin settings](docs/screenshots/settings.png)

---

## Update

```bat
venpm update AI-Plugin
```

Or, if you cloned by hand:

```bat
cd /d "%USERPROFILE%\Equicord"
git -C src\userplugins\AI-Plugin fetch origin
git -C src\userplugins\AI-Plugin reset --hard origin/main
corepack pnpm@11.20.0 run build
```

`git reset --hard` makes GitHub win over local edits in the plugin folder.

The plugin can also update itself on Discord startup (`autoUpdate`). Manual options: plugin settings → **Update now**, or `/aiupdate`. Restart Discord after a successful update.

---

## Configuration

| Setting | Description |
| --- | --- |
| Provider | Grok (xAI) or Codex (OpenAI / ChatGPT) |
| AI icon | Default, Grok, OpenAI, Atom, or custom SVG |
| Language | English, Magyar, Deutsch, Español |
| Grok / Codex model | Shown only for the active provider |
| Allow web search | Grok only |
| Include channel context | Attach Discord history for summaries and explain |
| Grok / Codex path | Optional override if auto-detect fails |
| Auto update | Pull from GitHub when Discord starts |

### Icon

**AI icon** has four built-in marks: Default, Grok, OpenAI, and Atom.

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
| `could not create leading directories of '$env:USERPROFILE\…'` | You ran a PowerShell path in cmd. Set a real path: `venpm config set vencord.path %USERPROFILE%\Equicord` |
| CLI not installed | Install Grok or Codex, then restart Discord |
| No active subscription | `grok login` or `codex login` |
| No chat-bar button | Enable **AI-Plugin**; confirm Chat Input Button API is on; restart after build |
| Inject / `app.asar` errors | Close Discord completely (tray included) and inject again |
| bun cannot link `@vencord/discord-types` | Use `corepack pnpm@11.20.0 install` |
| Plugin listed twice | You have both `src\userplugins\grokAi` and `src\userplugins\AI-Plugin`. Keep one folder. |

Desktop and Vesktop only.

---

## License

GPL-3.0-or-later, as required for Vencord plugins.
