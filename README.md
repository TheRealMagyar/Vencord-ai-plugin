# AI-Plugin

Vencord / Equicord userplugin: chat with **Grok** or **Codex** from Discord using your local CLI subscription.

No extra API key is required. The plugin finds `grok` / `codex` on your machine, detects a logged-in session (SuperGrok / X Premium+ / ChatGPT Plus), and talks through the CLI.

## Features

- **AI button** next to the GIF / sticker / Nitro buttons — opens the AI chat window
- **AI icon on message actions** (hover) — “Explain with AI”
- Same action in the **right-click** menu
- `/grok` slash command (optional question)
- Copy a reply or insert it into the Discord input
- The AI can **read the current Discord channel / DM** (e.g. “summarize our conversation from this week”); explain also includes nearby messages
- **Grok** or **Codex (ChatGPT / OpenAI)** — switch in plugin settings
- UI language: **English** (default), Hungarian, German, Spanish

Desktop Discord or Vesktop only. Vencord Web has no `native.ts` / CLI.

## Prerequisites

**Grok CLI**

```powershell
irm https://x.ai/cli/install.ps1 | iex
grok login
grok models
```

If you see `You are logged in with grok.com.`, the plugin can use it.

**Codex CLI**

Install the ChatGPT / Codex desktop app (or `npm i -g @openai/codex`) and run `codex login`. A ChatGPT Plus session in `%USERPROFILE%\.codex\auth.json` is enough.

## Install

You need the Equicord or Vencord **source** (the installer `.asar` is not enough).

### One command (Command Prompt)

Close Discord, open **cmd** (not PowerShell), paste:

```bat
cd /d "%USERPROFILE%\Documents\GitHub" && if not exist Equicord git clone https://github.com/Equicord/Equicord.git && cd Equicord && if not exist src\userplugins mkdir src\userplugins && if not exist src\userplugins\grokAi git clone https://github.com/TheRealMagyar/Vencord-ai-plugin.git src\userplugins\grokAi && (bun install || corepack pnpm@11.20.0 install) && bun run build && taskkill /F /IM Discord.exe 2>nul & set EQUICORD_USER_DATA_DIR=%CD%&& set EQUICORD_DIRECTORY=%CD%\dist\desktop&& set EQUICORD_DEV_INSTALL=1&& bun run inject -- -install -branch stable
```

If `bun install` fails on Equicord `link:` workspace packages, it falls back to `corepack pnpm`. Do **not** use `mkdir ... -Force` in cmd — that creates a folder named `-Force`.

### Manual

```powershell
cd $env:USERPROFILE\Documents\GitHub\Equicord
mkdir src\userplugins -Force
git clone https://github.com/TheRealMagyar/Vencord-ai-plugin.git src\userplugins\grokAi
```

Same for Vencord, just use the `Vencord` folder.

Then install and build with **one** package manager. In Windows PowerShell the `npm` shim is often blocked — use `npm.cmd`.

**bun**

```powershell
bun install
bun run build
bun run inject
```

**npm**

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run inject
```

If bun cannot resolve Equicord `link:` packages (`@vencord/discord-types is not linked`):

```powershell
corepack pnpm@11.20.0 install
corepack pnpm@11.20.0 run build
corepack pnpm@11.20.0 run inject
```

If the injector is interactive / fails, close Discord and run:

```powershell
$env:EQUICORD_USER_DATA_DIR = "$pwd"
$env:EQUICORD_DIRECTORY = "$pwd\dist\desktop"
$env:EQUICORD_DEV_INSTALL = "1"
.\dist\Installer\EquilotlCli.exe -install -branch stable
```

If `app.asar` is a folder and inject still fails, point Discord `resources\app.asar\index.js` at:

`C:\Users\User\Equicord\dist\desktop\patcher.js`

Start Discord. Settings → Plugins → **AI-Plugin** → Enable.

### Update (Command Prompt)

Close Discord, paste:

```bat
cd /d "%USERPROFILE%\Documents\GitHub\Equicord" && git -C src\userplugins\grokAi fetch origin && git -C src\userplugins\grokAi reset --hard origin/main && (bun run build || corepack pnpm@11.20.0 run build)
```

If your source is `C:\Users\User\Equicord`:

```bat
cd /d "%USERPROFILE%\Equicord" && git -C src\userplugins\grokAi fetch origin && git -C src\userplugins\grokAi reset --hard origin/main && (bun run build || corepack pnpm@11.20.0 run build)
```

The plugin also checks GitHub on Discord startup (`autoUpdate`). Manual: plugin settings → **Update now**, or `/grokupdate`. Then restart Discord.

## Settings

| Setting | What it does |
| --- | --- |
| Provider | Grok (xAI) or Codex (OpenAI / ChatGPT) |
| Language | English (default), Magyar, Deutsch, Español |
| Grok / Codex model | Models for the selected provider only |
| Allow web search | Grok web search |
| Include channel context | Send Discord history to the AI |
| Grok / Codex path | Optional custom CLI path |
| Auto update | Pull GitHub updates on startup |

## How it connects

On the Node side (`native.ts`):

1. Finds the CLI: setting → default install path → PATH
2. Reads local login metadata (`auth.json`) — **tokens are never sent to the renderer**
3. Sends the prompt headlessly (`grok --prompt-file` or `codex exec`) in an isolated temp folder, without file/shell tools

The CLI keeps the conversation session (`--resume` / `codex exec resume`).

## Troubleshooting

- **“Grok / Codex CLI is not installed”** — install the CLI, then restart Discord
- **“No active subscription”** — `grok login` or `codex login`
- Button missing — is **AI-Plugin** enabled? Did you restart Discord after the build?
- Desktop only. Vesktop is fine. Vencord Web is not.

## License

GPL-3.0-or-later (required for Vencord plugins).
