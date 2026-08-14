# AI-Plugin

Grok or Codex inside Discord, using the CLI already signed in on your machine. Desktop / Vesktop only.

![AI chat window](docs/screenshots/chat-window.png)

Chat-bar button, **Explain with AI**, `/ai`, `/aiupdate`. Per-channel history. English, Magyar, Deutsch, Español.

![Chat bar](docs/screenshots/chat-bar.png)
![Explain](docs/screenshots/explain.png)
![Settings](docs/screenshots/settings.png)

## Needs

- Equicord or Vencord **source tree** (not the installer `.asar`)
- [Grok CLI](https://x.ai/cli) + `grok login`, and/or Codex + `codex login`

## Install

**cmd.exe.** Do not use `$env:USERPROFILE` — that is PowerShell and breaks venpm.

```bat
npm.cmd install -g @kamaras/venpm
venpm config set vencord.path %USERPROFILE%\Equicord
venpm repo add https://github.com/TheRealMagyar/Vencord-ai-plugin/releases/latest/download/plugins.json --name ai-plugin
venpm install AI-Plugin
```

Documents tree: `venpm config set vencord.path %USERPROFILE%\Documents\GitHub\Equicord`

Then Discord → **Settings → Plugins → AI-Plugin → Enable**.

## Update

```bat
venpm update AI-Plugin
```

Or in the plugin: **Update now** / `/aiupdate`. Restart Discord after.

## License

GPL-3.0-or-later
