# GrokAi

Vencord / Equicord userplugin: Grok a Discord chatben, a **helyi Grok CLI** előfizetéseddel.

A plugin nem kér külön API kulcsot. Megkeresi a gépeden a `grok` CLI-t (`%USERPROFILE%\.grok\bin\grok.exe`), ellenőrzi a `grok login` sessiont (SuperGrok / X Premium+ / grok.com), és headless módban azon keresztül beszélget.

## Mit tud

- **AI gomb a chatbárban** (GIF / sticker / nitro gombok mellett) — megnyit egy Grok chatablakot
- **AI ikon az üzenet műveleteknél** (hover) — „Magyarázat Grokkal”
- Ugyanez a **jobb klikk** menüben is
- `/grok` slash parancs, opcionális kérdéssel
- Válasz másolása vagy beszúrása a Discord inputba

Csak **asztali Discord** vagy **Vesktop** alatt megy. A böngészős Vencordban nincs `native.ts` / CLI.

## Előfeltétel: Grok CLI

1. Telepítés (Windows PowerShell):

```powershell
irm https://x.ai/cli/install.ps1 | iex
```

2. Bejelentkezés az előfizetéseddel:

```powershell
grok login
```

3. Ellenőrzés:

```powershell
grok models
```

Ha ezt látod: `You are logged in with grok.com.` — a plugin is ezt észleli.

## Telepítés

Kell hozzá az Equicord vagy Vencord **forrás** (nem elég az installer `.asar`).

### Egy parancs (Command Prompt)

Zárd be a Discordot, nyiss egy **cmd**-t (nem PowerShell), illeszd be:

```bat
cd /d "%USERPROFILE%\Documents\GitHub" && if not exist Equicord git clone https://github.com/Equicord/Equicord.git && cd Equicord && if not exist src\userplugins mkdir src\userplugins && if not exist src\userplugins\grokAi git clone https://github.com/TheRealMagyar/Vencord-ai-plugin.git src\userplugins\grokAi && (bun install || corepack pnpm@11.20.0 install) && bun run build && taskkill /F /IM Discord.exe 2>nul & set EQUICORD_USER_DATA_DIR=%CD%&& set EQUICORD_DIRECTORY=%CD%\dist\desktop&& set EQUICORD_DEV_INSTALL=1&& bun run inject -- -install -branch stable
```

A `bun install` ha elhasal az Equicord workspace-en, automatikusan `corepack pnpm`-re vált. A `mkdir ... -Force` cmd-ben **nem** kell — az egy PowerShell flag, és külön `-Force` mappát csinál.

```powershell
cd $env:USERPROFILE\Equicord
mkdir src\userplugins -Force
git clone https://github.com/TheRealMagyar/Vencord-ai-plugin.git src\userplugins\grokAi
```

Vencordra ugyanez, csak a `Vencord` mappában.

Ezután **egy** csomagkezelővel install + build. Windows PowerShellben az `npm` shim gyakran tiltva van — ott `npm.cmd`-t használj.

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

Ha a `bun install` az Equicord `link:` workspace csomagjain elhasal (`@vencord/discord-types is not linked`), a Node-dal jövő corepack is elég, külön pnpm telepítés nélkül:

```powershell
corepack pnpm@11.20.0 install
corepack pnpm@11.20.0 run build
corepack pnpm@11.20.0 run inject
```

Ha az injector interaktív / elhasal, Discordot zárd be, majd:

```powershell
$env:EQUICORD_USER_DATA_DIR = "$pwd"
$env:EQUICORD_DIRECTORY = "$pwd\dist\desktop"
$env:EQUICORD_DEV_INSTALL = "1"
.\dist\Installer\EquilotlCli.exe -install -branch stable
```

Ha az `app.asar` mappa miatt az injector továbbra sem megy, a Discord `resources\app.asar\index.js` mutasson ide:

`C:\Users\User\Equicord\dist\desktop\patcher.js`

Indítsd a Discordot. Settings → Plugins → **GrokAi** → Enable.

### Frissítés (Command Prompt)

Zárd be a Discordot, illeszd be:

```bat
cd /d "%USERPROFILE%\Documents\GitHub\Equicord" && git -C src\userplugins\grokAi pull && (bun run build || corepack pnpm@11.20.0 run build)
```

Ha a forrásod `C:\Users\User\Equicord`:

```bat
cd /d "%USERPROFILE%\Equicord" && git -C src\userplugins\grokAi pull && (bun run build || corepack pnpm@11.20.0 run build)
```

A plugin **magától is** ellenőrzi a GitHubot Discord indításkor (beállítás: *autoUpdate*). Kézzel: plugin settings → **Frissítés most**, vagy `/grokupdate`. Utána Discord restart.

## Beállítások

| Beállítás | Mit csinál |
| --- | --- |
| Language | UI + Grok válasz nyelve (`auto` / magyar / angol) |
| Model | `grok-4.6` vagy `grok-4.5` |
| Allow web search | Grok kereshet a weben |
| Grok path | Opcionális saját `grok.exe` útvonal, ha az auto-detect nem találja |

## Hogyan csatlakozik

A plugin Node oldalon (`native.ts`) ezt csinálja:

1. Megkeresi a CLI-t: beállítás → `%USERPROFILE%\.grok\bin\grok.exe` → PATH
2. `grok models` + `auth.json` meta (név, lejárat — **tokent soha nem olvassa ki / nem küldi a rendererbe**)
3. Kérdésnél: `grok --prompt-file ... --output-format json` egy izolált temp mappában, fájlírás/shell toolok nélkül

A beszélgetés sessionjét a CLI tartja (`--resume`).

## Hibaelhárítás

- **„A Grok CLI nincs telepítve”** — futtasd az installert, majd Discord restart
- **„Nincs aktív Grok előfizetés”** — `grok login`, ellenőrizd: `grok models`
- A gomb nem jelenik meg — plugin be van kapcsolva? Discord újraindult a `bun run build` / `npm.cmd run build` után?
- Csak asztali kliens. Vesktop OK, Vencord Web nem.

## Licenc

GPL-3.0-or-later (Vencord plugin követelmény).
