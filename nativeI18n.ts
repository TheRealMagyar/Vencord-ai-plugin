/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type NativeLang = "en" | "hu" | "de" | "es";

const dict = {
    grokMissing: {
        en: "Grok CLI is not installed. Install it, then run: grok login",
        hu: "A Grok CLI nincs telepítve. Telepítsd, majd: grok login",
        de: "Grok-CLI ist nicht installiert. Installieren, dann: grok login",
        es: "La CLI de Grok no está instalada. Instálala y ejecuta: grok login",
    },
    grokNotFound: {
        en: "Grok CLI was not found. Install it, then run: grok login",
        hu: "A Grok CLI nem található. Telepítsd, majd: grok login",
        de: "Grok-CLI wurde nicht gefunden. Installieren, dann: grok login",
        es: "No se encontró la CLI de Grok. Instálala y ejecuta: grok login",
    },
    grokNotLoggedIn: {
        en: "No active Grok login. Run: grok login",
        hu: "Nincs aktív Grok bejelentkezés. Futtasd: grok login",
        de: "Keine aktive Grok-Anmeldung. Ausführen: grok login",
        es: "No hay sesión de Grok. Ejecuta: grok login",
    },
    grokLoginFailed: {
        en: "Grok CLI could not log in: {error}. Run: grok login",
        hu: "A Grok CLI nem tudott bejelentkezni: {error}. Futtasd: grok login",
        de: "Grok-CLI konnte sich nicht anmelden: {error}. Ausführen: grok login",
        es: "La CLI de Grok no pudo iniciar sesión: {error}. Ejecuta: grok login",
    },
    grokEmpty: {
        en: "The Grok CLI returned an empty reply.",
        hu: "A Grok CLI üres választ adott.",
        de: "Die Grok-CLI hat eine leere Antwort gegeben.",
        es: "La CLI de Grok devolvió una respuesta vacía.",
    },
    grokParse: {
        en: "Could not read text from the Grok reply.",
        hu: "A Grok válaszából nem sikerült szöveget kiolvasni.",
        de: "Aus der Grok-Antwort konnte kein Text gelesen werden.",
        es: "No se pudo leer texto de la respuesta de Grok.",
    },
    grokError: {
        en: "Grok error",
        hu: "Grok hiba",
        de: "Grok-Fehler",
        es: "Error de Grok",
    },
    grokExit: {
        en: "Grok exited (code {code}).",
        hu: "Grok kilépett (kód {code}).",
        de: "Grok wurde beendet (Code {code}).",
        es: "Grok salió (código {code}).",
    },
    codexMissing: {
        en: "Codex CLI is not installed. Install the ChatGPT / Codex app, or: npm i -g @openai/codex",
        hu: "A Codex CLI nincs telepítve. Telepítsd a ChatGPT / Codex appot, vagy: npm i -g @openai/codex",
        de: "Codex-CLI ist nicht installiert. ChatGPT-/Codex-App installieren, oder: npm i -g @openai/codex",
        es: "La CLI de Codex no está instalada. Instala la app de ChatGPT / Codex, o: npm i -g @openai/codex",
    },
    codexNotFound: {
        en: "Codex CLI was not found. Run: codex login",
        hu: "A Codex CLI nem található. Futtasd: codex login",
        de: "Codex-CLI wurde nicht gefunden. Ausführen: codex login",
        es: "No se encontró la CLI de Codex. Ejecuta: codex login",
    },
    codexNotLoggedIn: {
        en: "No active Codex / ChatGPT login. Run: codex login",
        hu: "Nincs aktív Codex / ChatGPT bejelentkezés. Futtasd: codex login",
        de: "Keine aktive Codex-/ChatGPT-Anmeldung. Ausführen: codex login",
        es: "No hay sesión de Codex / ChatGPT. Ejecuta: codex login",
    },
    codexEmpty: {
        en: "The Codex CLI returned an empty reply.",
        hu: "A Codex CLI üres választ adott.",
        de: "Die Codex-CLI hat eine leere Antwort gegeben.",
        es: "La CLI de Codex devolvió una respuesta vacía.",
    },
    codexError: {
        en: "Codex error",
        hu: "Codex hiba",
        de: "Codex-Fehler",
        es: "Error de Codex",
    },
    codexExit: {
        en: "Codex exited (code {code}).",
        hu: "Codex kilépett (kód {code}).",
        de: "Codex wurde beendet (Code {code}).",
        es: "Codex salió (código {code}).",
    },
    timedOut: {
        en: "Timed out ({seconds}s).",
        hu: "Időtúllépés ({seconds}s).",
        de: "Zeitüberschreitung ({seconds}s).",
        es: "Tiempo agotado ({seconds}s).",
    },
    timedOutFactCheck: {
        en: "Timed out ({seconds}s). Try a quicker fact-check depth in settings.",
        hu: "Időtúllépés ({seconds}s). Próbálj gyorsabb fact-check mélységet a beállításokban.",
        de: "Zeitüberschreitung ({seconds}s). Wähle in den Einstellungen eine schnellere Fact-Check-Tiefe.",
        es: "Tiempo agotado ({seconds}s). Prueba una profundidad de fact-check más rápida en ajustes.",
    },
    timedOutCommand: {
        en: "Timed out: {command}",
        hu: "Időtúllépés: {command}",
        de: "Zeitüberschreitung: {command}",
        es: "Tiempo agotado: {command}",
    },
    updateFolderMissing: {
        en: "Could not find the AI-Plugin git folder (src/userplugins/aiPlugin, AI-Plugin, or grokAi).",
        hu: "Nem találom az AI-Plugin git mappát (src/userplugins/aiPlugin, AI-Plugin vagy grokAi).",
        de: "AI-Plugin-Git-Ordner nicht gefunden (src/userplugins/aiPlugin, AI-Plugin oder grokAi).",
        es: "No se encontró la carpeta git de AI-Plugin (src/userplugins/aiPlugin, AI-Plugin o grokAi).",
    },
    updateNoBuild: {
        en: "Source updated, but the Equicord/Vencord build was not found. Run the build command.",
        hu: "A forrást frissítettem, de az Equicord/Vencord buildet nem találtam. Futtasd a build parancsot.",
        de: "Quelle aktualisiert, aber Equicord/Vencord-Build nicht gefunden. Build-Befehl ausführen.",
        es: "Código actualizado, pero no se encontró el build de Equicord/Vencord. Ejecuta el build.",
    },
} as const;

export type NativeI18nKey = keyof typeof dict;

export function nativeLang(raw?: string): NativeLang {
    if (raw === "hu" || raw === "de" || raw === "es" || raw === "en") return raw;
    return "en";
}

export function nativeT(lang: string | undefined, key: NativeI18nKey, vars?: Record<string, string | number>) {
    const resolved = nativeLang(lang);
    let text: string = dict[key][resolved] || dict[key].en;
    if (vars) {
        for (const [name, value] of Object.entries(vars))
            text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
}
