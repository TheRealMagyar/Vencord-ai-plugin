# AI-Plugin

Local **Grok (xAI)** or **Codex (OpenAI / ChatGPT)** inside Discord. The plugin talks to the CLI already signed in on your machine. No API key, no tokens in Discord’s renderer.

Works on **Discord Desktop**, **Vesktop**, and **Equibop**. It does **not** run in Equicord / Vencord Web.

This is a **userplugin**, not an official Equicord plugin. Install it under `src/userplugins/` as documented at [docs.equicord.org/plugins](https://docs.equicord.org/plugins).

The UI language is **English** by default. In settings you can switch to Magyar, Deutsch, or Español — that changes the plugin UI, error messages (including timeouts), and the language the model replies in.

![AI chat window](docs/screenshots/chat-window.png)

---

## Equicord layout

Equicord only loads userplugins from `src/userplugins/<camelCaseFolder>/index.ts(x)`. Official plugins go in `src/equicordplugins/`; Vencord-sourced plugins go in `src/plugins/`. **Do not put this repo in those folders.**

| Path | Valid? |
| --- | --- |
| `src/userplugins/aiPlugin/index.tsx` | Yes — required layout |
| `src/userplugins/aiPlugin.desktop/index.tsx` | Yes — same plugin, hidden on Equicord Web |
| `src/userplugins/AI-Plugin/…` | No — hyphen / PascalCase folder (Equicord troubleshooting: “folder name is not camelCase”) |
| `src/userplugins/index.tsx` | No — missing plugin folder |
| `src/equicordplugins/aiPlugin/…` | No — official Equicord tree only |

This repo **is** the plugin folder: it already has `index.tsx` (renderer) and `native.ts` (Electron main / Node). Clone it so the folder name is `aiPlugin`.

```text
src/userplugins/aiPlugin/
  index.tsx      required entry
  native.ts      desktop CLI (Grok / Codex)
  README.md
  …
```

---

## Features

| Area | What you get |
| --- | --- |
| Chat bar | AI button next to GIF / sticker / Nitro |
| Channel header | AI button next to search / pins — works in **read-only** channels where you cannot type |
| Channel menu | Right-click a channel / thread / group DM → **Open AI** |
| Messages | Hover and right-click: **Explain with AI**, **Fact-check with AI** |
| Chat window | Per-channel history, left sidebar of saved chats, live thinking / tools, **Stop** |
| Background CLI | Grok / Codex status is checked when Discord starts, not when you open the window |
| Background jobs | Closing the window does not stop a running reply |
| Notifications | If the window is closed when a reply finishes, you get a toast (click the Vencord notice to reopen that chat) |
| Stop | Interrupt a running reply; any text already written is kept |
| Thinking | Optional live reasoning and tool use (web search, page fetch, etc.) |
| Fact-check | Quick / Balanced / Deep — see [Fact-check](#fact-check) |
| Context | Optional nearby Discord transcript (`>>>` marks the target message) |
| Commands | `/ai` (optional question), `/aiupdate` |
| Providers | Grok CLI or Codex CLI |
| Models | Grok 4.6 / 4.5, or GPT-5.6 Sol–Luna / 5.5 / 5.4 / 5.4-Mini |
| Language | English (default), Magyar, Deutsch, Español |
| Icon | Default, Grok, OpenAI, Atom, or a custom SVG (`currentColor`) |
| Updates | venpm, `/aiupdate`, settings **Update now**, or auto-pull on Discord start |

---

## Screenshots

### Chat bar

AI button next to GIF / sticker / Nitro.

![Chat bar AI button](docs/screenshots/chat-bar.png)

### Chat window

Sidebar of saved chats, per-channel history, thinking / tools, Stop.

![AI chat window](docs/screenshots/chat-window.png)

### Explain / Fact-check with AI

Message hover and context menu.

![Explain with AI](docs/screenshots/explain.png)

### Settings

Provider, model, language, icon, fact-check depth, paths, updates.

![Plugin settings](docs/screenshots/settings.png)

---

## Requirements

| What | Why |
| --- | --- |
| Equicord (or Vencord) **built from source** | Userplugins are bundled at `pnpm build`. The installer `.asar` cannot load this plugin. Follow [Building from Source](https://docs.equicord.org/building-from-source) first. |
| Discord Desktop, Vesktop, or Equibop | `native.ts` runs in Electron’s main process. |
| [Grok CLI](https://x.ai/cli) and `grok login` | SuperGrok / X Premium+. Needed if the provider is Grok. |
| Codex CLI and `codex login` | ChatGPT / Codex desktop app, or `npm i -g @openai/codex`. Needed if the provider is Codex. |

Equicord does **not** provide support for userplugins or dev builds. Ask in developer channels only if needed.

### Grok

PowerShell:

```powershell
irm https://x.ai/cli/install.ps1 | iex
grok login
grok models
```

A line like `You are logged in with grok.com.` means the plugin can attach.

### Codex

Install the ChatGPT / Codex desktop app, or:

```bat
npm.cmd i -g @openai/codex
codex login
```

Codex uses `%USERPROFILE%\.codex\auth.json`. Access tokens stay on disk and are never sent to Discord’s renderer. Same for Grok (`%USERPROFILE%\.grok\auth.json`).

---

## Install

Follow [Installing User Plugins](https://docs.equicord.org/plugins). You must already have an Equicord source tree from [Building from Source](https://docs.equicord.org/building-from-source).

Windows examples below use **cmd.exe**. Do **not** paste `$env:USERPROFILE` into cmd. That is PowerShell.

### 1. Create `src/userplugins/`

This folder does not exist by default.

macOS / Linux:

```sh
cd "$HOME/Documents/Equicord"   # or wherever you cloned Equicord
mkdir -p src/userplugins
```

Windows (cmd):

```bat
cd /d "%USERPROFILE%\Documents\Equicord"
if not exist src\userplugins mkdir src\userplugins
```

Do not use `mkdir … -Force` in cmd. `-Force` is a PowerShell flag and creates a folder named `-Force`.

### 2. Clone this plugin as `aiPlugin`

The folder name must be **camelCase**.

macOS / Linux:

```sh
git clone https://github.com/TheRealMagyar/Vencord-ai-plugin.git src/userplugins/aiPlugin
```

Windows (cmd):

```bat
if not exist src\userplugins\aiPlugin git clone https://github.com/TheRealMagyar/Vencord-ai-plugin.git src\userplugins\aiPlugin
```

Valid: `src/userplugins/aiPlugin/index.tsx`  
Invalid: `src/userplugins/AI-Plugin/…`, a nested extra folder, or an entry file that is not `index.ts` / `index.tsx`.

Already cloned as `AI-Plugin` or `grokAi`? Rename, then rebuild:

```sh
mv src/userplugins/AI-Plugin src/userplugins/aiPlugin
```

```bat
ren src\userplugins\AI-Plugin aiPlugin
```

Keep only one of those folders so the plugin is not loaded twice.

Optional: clone as `src/userplugins/aiPlugin.desktop` instead. Equicord then treats it as desktop-only and hides it from web builds.

### 3. Rebuild Equicord

From the Equicord root (not the plugin folder):

```sh
pnpm build
```

Developer tools / PatchHelper:

```sh
pnpm build --dev
```

Watch mode while you edit the plugin:

```sh
pnpm build --watch
```

If `pnpm` is missing: `npm i -g pnpm`, then `pnpm install --no-frozen-lockfile` in the Equicord folder (see the Equicord build guide). Do **not** run that in an administrator terminal on Windows.

If this Equicord tree already uses `corepack` / bun:

```bat
corepack pnpm@11.20.0 install
corepack pnpm@11.20.0 run build
```

```bat
bun install
bun run build
```

If bun cannot link `@vencord/discord-types`, use `corepack pnpm@11.20.0` instead.

### 4. Restart Discord

Fully quit Discord (tray icon too), start it again, then:

**Settings → Plugins → AI-Plugin → Enable**

Also enable these API plugins if they appear separately:

- Chat Input Button API
- Message Popover API
- Commands API
- Header Bar API

`HeaderBarAPI` is the channel-header AI button (read-only channels).

### venpm

[venpm](https://venpm.dev) clones into `src/userplugins/aiPlugin` and rebuilds. Close Discord first.

```bat
npm.cmd install -g @kamaras/venpm
venpm doctor
venpm config set vencord.path %USERPROFILE%\Documents\Equicord
venpm repo add https://github.com/TheRealMagyar/Vencord-ai-plugin/releases/latest/download/plugins.json --name ai-plugin
venpm install aiPlugin
```

If Equicord is not under Documents:

```bat
venpm config set vencord.path %USERPROFILE%\Equicord
```

Vencord instead of Equicord: point `vencord.path` at that folder.

PowerShell (only if you are actually in PowerShell):

```powershell
venpm config set vencord.path "$env:USERPROFILE\Documents\Equicord"
```

### Inject Discord (first time)

If Equicord is not patched into Discord yet, from the Equicord root ([Building from Source](https://docs.equicord.org/building-from-source)):

```sh
pnpm inject
```

Then start Discord normally. You only need to inject again if Discord is not already patched.

---

## Update

### venpm

```bat
venpm update aiPlugin
```

### Plugin UI

- Settings → AI-Plugin → **Update now**
- Slash command: `/aiupdate`
- Optional: **Auto update** on Discord startup

Restart Discord after a successful update.

### Manual git

macOS / Linux:

```sh
cd "$HOME/Documents/Equicord"
git -C src/userplugins/aiPlugin fetch origin
git -C src/userplugins/aiPlugin reset --hard origin/main
pnpm build
```

Windows (cmd):

```bat
cd /d "%USERPROFILE%\Documents\Equicord"
git -C src\userplugins\aiPlugin fetch origin
git -C src\userplugins\aiPlugin reset --hard origin/main
pnpm build
```

`git reset --hard` makes GitHub win over local edits in the plugin folder.

Equicord’s own `git pull` does **not** update userplugins. Only the plugin folder (or venpm / **Update now**) does.

The in-plugin updater looks for `aiPlugin`, `aiPlugin.desktop`, `AI-Plugin`, and `grokAi`. Keep only one folder so the plugin is not loaded twice.

---

## Usage

| Action | How |
| --- | --- |
| Open the AI chat | Chat bar AI button, channel header AI button, right-click the channel → **Open AI**, or `/ai` with no text |
| Ask in the current channel | `/ai` + your question (the reply is posted as a bot message) |
| Explain a message | Hover the message → AI icon, or right-click → **Explain with AI** |
| Fact-check a message | Hover the message → shield icon, or right-click → **Fact-check with AI** |
| Stop a running reply | **Stop** in the chat composer |
| Done while the window is closed | Bottom toast; click the Vencord notification to reopen that chat |
| Switch saved chats | Left sidebar |
| Delete a saved chat | × on the sidebar row (disabled while that chat is thinking) |
| Update the plugin | `/aiupdate` |

Enter sends. Shift+Enter inserts a new line.

---

## Chat window

The plugin connects to the Grok / Codex CLI **in the background when Discord starts**, so opening the window does not wait on a handshake.

| Piece | Behavior |
| --- | --- |
| Left sidebar | Every channel / DM that already has AI history. A spinner means that chat is still running. |
| Delete | × on a sidebar row. You cannot delete a chat while it is thinking — stop it first, or wait. |
| History | Saved **per Discord channel or DM**. **Clear history** only clears the open thread. |
| Thinking | Toolbar toggle (and a setting). Shows reasoning and tool steps (web search, etc.) live. The final answer stays in its own bubble. |
| Stop | Kills the local CLI process. Any text already streamed is kept; otherwise the chat shows **Stopped.** |
| Background | Closing the window does **not** stop a running reply. Reopen the same channel to see thinking / tools / the answer. |
| Notifications | If a reply finishes while the window is closed, Discord shows a toast. The Vencord notification reopens that chat. |
| Copy / Insert | On finished assistant messages: copy, or insert into the Discord input box. |

---

## Fact-check

Fact-check always uses web search on Grok. Depth is a setting:

| Depth | What it does | Time limit |
| --- | --- | --- |
| **Quick** | 1 search, short verdict | 90s |
| **Balanced** (default) | At most 2 searches, no page fetch | 150s |
| **Deep** | More searches + read key sources | 240s |

If the limit is hit, any text already written is shown instead of only an error.

If **Include channel context** is on, nearby messages are attached (the target is marked with `>>>`).

---

## Settings

| Setting | Description |
| --- | --- |
| Provider | Grok (xAI) or Codex (OpenAI / ChatGPT) |
| AI icon | Default, Grok, OpenAI, Atom, or Custom SVG |
| Custom SVG | Shown only when the icon is Custom SVG |
| Language | English (default), Magyar, Deutsch, Español — UI, errors, and model replies |
| Grok model | `grok-4.6` (default) or `grok-4.5`. Hidden when Codex is selected |
| Codex model | CLI default, GPT-5.6 Sol / Terra / Luna, GPT-5.5, 5.4, 5.4-Mini. Hidden when Grok is selected |
| Allow web search | Grok only, for **normal chat** (fact-check has its own search) |
| Show thinking | Live thinking + tool use (Grok and Codex) |
| Fact-check depth | Quick, Balanced (default), or Deep |
| Include channel context | Attach Discord history for summaries, explain, and fact-check |
| Grok / Codex path | Optional override if auto-detect fails |
| Auto update | Pull from GitHub when Discord starts |

### Icon

Built-in marks: **Default**, **Grok**, **OpenAI**, **Atom**. They use `currentColor`, so they follow Discord light / dark theme.

**Custom SVG** accepts a full document or a single shape:

```svg
<svg viewBox="0 0 24 24">
  <path d="M12 2 15 9 22 12 15 15 12 22 9 15 2 12 9 9Z"/>
</svg>
```

```svg
<path d="M12 2 15 9 22 12 15 15 12 22 9 15 2 12 9 9Z"/>
```

Scripts, event handlers, and external images are stripped.

---

## venpm index

Authors / other users can add this repo with:

```bat
venpm repo add https://github.com/TheRealMagyar/Vencord-ai-plugin/releases/latest/download/plugins.json --name ai-plugin
venpm install aiPlugin
```

`plugins.json` lives at the repo root and is published as a GitHub Release asset (`latest`) on every push to `main`. See [venpm.dev](https://venpm.dev).

---

## How it connects

`native.ts` runs in Electron’s main process:

1. Resolves the CLI from the setting, the default install path, then `PATH`.
2. Reads local login metadata from `auth.json`. Access tokens are never sent to the renderer.
3. Runs a headless turn in an isolated temp directory (`grok --prompt-file` or `codex exec --json`), with file / shell tools disabled.

Sessions are resumed per channel and per provider (`--resume` / `codex exec resume`). CLI status is cached after a background probe on Discord start (and refreshed about every 5 minutes).

---

## Troubleshooting

| Symptom | What to try |
| --- | --- |
| `could not create leading directories of '$env:USERPROFILE\…'` | You ran a PowerShell path in **cmd**. Fix: `venpm config set vencord.path %USERPROFILE%\Equicord` |
| CLI not installed | Install Grok or Codex, then restart Discord |
| No active subscription | `grok login` or `codex login` |
| Plugin missing from Settings | Folder must be `src/userplugins/aiPlugin` (camelCase) with `index.tsx`. Rebuild (`pnpm build`) and fully restart Discord. See [Equicord troubleshooting](https://docs.equicord.org/plugins). |
| No chat-bar button | Enable **AI-Plugin**; turn on Chat Input Button API; rebuild; restart Discord |
| No header AI button | Enable Header Bar API; rebuild; restart Discord |
| `/ai` missing | Enable Commands API; restart after build |
| Timed out | Use a quicker **Fact-check depth**, or retry |
| Discord crashes when opening AI from a channel | Update to the latest plugin, rebuild, restart |
| Inject / `app.asar` errors | Close Discord completely (tray included) and inject again |
| `pnpm build` missing packages | `pnpm install` in the Equicord root, then build again |
| bun cannot link `@vencord/discord-types` | `corepack pnpm@11.20.0 install` |
| Plugin listed twice | More than one of `aiPlugin`, `AI-Plugin`, `grokAi` exists under `src/userplugins`. Keep `aiPlugin` only |
| Update cannot find the folder | Plugin must be a git clone named `aiPlugin` (or the older `AI-Plugin` / `grokAi`) under `src/userplugins` |

Desktop and Vesktop only.

---

## License

GPL-3.0-or-later, as required for Vencord / Equicord plugins.
