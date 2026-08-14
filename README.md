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

## Telepítés (globális pnpm nem kell)

Az Equicord `link:` workspace csomagokat használ, ezért **bun / npm nem elég**. A Node-dal jövő **corepack** futtatja a pnpm-et, nem kell külön telepíteni:

```powershell
cd $env:USERPROFILE\Equicord
mkdir src\userplugins -Force
git clone https://github.com/TheRealMagyar/Vencord-ai-plugin.git src\userplugins\grokAi
corepack pnpm@11.20.0 install
corepack pnpm@11.20.0 run build
```

Ha a Discord be van zárva:

```powershell
$env:EQUICORD_USER_DATA_DIR = "$pwd"
$env:EQUICORD_DIRECTORY = "$pwd\dist\desktop"
$env:EQUICORD_DEV_INSTALL = "1"
.\dist\Installer\EquilotlCli.exe -install -branch stable
```

Ha az injector elhasal (`app.asar` mappa), a `resources\app.asar\index.js` mutasson ide:

`C:\Users\User\Equicord\dist\desktop\patcher.js`

Indítsd a Discordot. Settings → Plugins → **GrokAi** → Enable.

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
- A gomb nem jelenik meg — plugin be van kapcsolva? Discord újraindult a `bun run build` után?
- Csak asztali kliens. Vesktop OK, Vencord Web nem.

## Licenc

GPL-3.0-or-later (Vencord plugin követelmény).
