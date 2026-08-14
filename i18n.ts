/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "./settings";

export type UiLang = "en" | "hu" | "de" | "es";

const dict = {
    desktopOnly: {
        en: "This plugin only works on desktop Discord / Vesktop (local Grok or Codex CLI required).",
        hu: "Ez a plugin csak asztali Discordon / Vesktopon működik (helyi Grok vagy Codex CLI kell).",
        de: "Dieses Plugin funktioniert nur in Discord Desktop / Vesktop (lokale Grok- oder Codex-CLI nötig).",
        es: "Este plugin solo funciona en Discord de escritorio / Vesktop (se necesita la CLI local de Grok o Codex).",
    },
    explainVisible: {
        en: "Explain this message{author}:\n{content}",
        hu: "Magyarázd el ezt az üzenetet{author}:\n{content}",
        de: "Erkläre diese Nachricht{author}:\n{content}",
        es: "Explica este mensaje{author}:\n{content}",
    },
    explainPrompt: {
        en: "Explain this Discord message (marked with >>>). Cover slang, tone, and nearby conversation.\nAuthor: {author}\nChannel: {channel}\nMessage:\n{content}",
        hu: "Magyarázd el ezt a Discord üzenetet (>>> jelöli). Térj ki a szlengre, hangnemre és a környező beszélgetésre.\nSzerző: {author}\nCsatorna: {channel}\nÜzenet:\n{content}",
        de: "Erkläre diese Discord-Nachricht (mit >>> markiert). Gehe auf Slang, Ton und den umliegenden Chat ein.\nAutor: {author}\nKanal: {channel}\nNachricht:\n{content}",
        es: "Explica este mensaje de Discord (marcado con >>>). Cubre el argot, el tono y la conversación cercana.\nAutor: {author}\nCanal: {channel}\nMensaje:\n{content}",
    },
    factCheckVisible: {
        en: "Fact-check this message{author}:\n{content}",
        hu: "Ellenőrizd ennek az üzenetnek a tényeit{author}:\n{content}",
        de: "Prüfe die Fakten dieser Nachricht{author}:\n{content}",
        es: "Verifica los hechos de este mensaje{author}:\n{content}",
    },
    factCheckPrompt: {
        en: "Fact-check this Discord message (marked with >>>). Use web_search and web_fetch now, then write the complete fact-check in the same reply. Do not stop after saying you will look it up. List each checkable claim and give a verdict: True, Mostly true, Mixed, Mostly false, False, or Unverifiable. Short reason and sources for each. Note uncertainty. If there are no factual claims, say so.\nAuthor: {author}\nChannel: {channel}\nMessage:\n{content}",
        hu: "Ellenőrizd ennek a Discord üzenetnek (>>> jelöli) a tényállításait. Használd most a web_search és web_fetch toolokat, majd ugyanebben a válaszban írd meg a teljes tényellenőrzést. Ne állj meg annál, hogy utánanézel. Sorold fel az ellenőrizhető állításokat, és adj ítéletet: Igaz, Többnyire igaz, Vegyes, Többnyire hamis, Hamis, vagy Nem ellenőrizhető. Rövid indoklás és források. Írd le a bizonytalanságot. Ha nincs tényállítás, mondd meg.\nSzerző: {author}\nCsatorna: {channel}\nÜzenet:\n{content}",
        de: "Prüfe die Fakten dieser Discord-Nachricht (mit >>> markiert). Nutze jetzt web_search und web_fetch, und schreib danach in derselben Antwort die vollständige Prüfung. Hör nicht auf, nachdem du gesagt hast, dass du nachschaust. Liste jede überprüfbare Behauptung und gib ein Urteil: Wahr, Überwiegend wahr, Gemischt, Überwiegend falsch, Falsch oder Nicht überprüfbar. Kurze Begründung und Quellen. Unsicherheit nennen. Wenn es keine Faktenbehauptung gibt, sag das.\nAutor: {author}\nKanal: {channel}\nNachricht:\n{content}",
        es: "Verifica los hechos de este mensaje de Discord (marcado con >>>). Usa ahora web_search y web_fetch, y escribe la verificación completa en la misma respuesta. No te detengas tras decir que lo vas a buscar. Enumera cada afirmación comprobable y da un veredicto: Verdadero, Mayormente verdadero, Mixto, Mayormente falso, Falso o No verificable. Razón breve y fuentes. Señala la incertidumbre. Si no hay afirmaciones de hecho, dilo.\nAutor: {author}\nCanal: {channel}\nMensaje:\n{content}",
    },
    thinking: {
        en: "{provider} is thinking…",
        hu: "{provider} gondolkodik…",
        de: "{provider} denkt nach…",
        es: "{provider} está pensando…",
    },
    thinkingLabel: {
        en: "Thinking",
        hu: "Gondolkodás",
        de: "Denken",
        es: "Pensando",
    },
    thinkingToggle: {
        en: "Thinking",
        hu: "Gondolkodás",
        de: "Denken",
        es: "Pensando",
    },
    toolSearch: {
        en: "Searching the web",
        hu: "Webes keresés",
        de: "Websuche",
        es: "Buscando en la web",
    },
    toolFetch: {
        en: "Reading a page",
        hu: "Oldal olvasása",
        de: "Seite lesen",
        es: "Leyendo una página",
    },
    toolRunning: {
        en: "Using {name}",
        hu: "{name} használata",
        de: "{name} wird verwendet",
        es: "Usando {name}",
    },
    unknownError: {
        en: "Unknown AI error.",
        hu: "Ismeretlen AI hiba.",
        de: "Unbekannter KI-Fehler.",
        es: "Error de IA desconocido.",
    },
    connected: {
        en: "connected",
        hu: "csatlakozva",
        de: "verbunden",
        es: "conectado",
    },
    connecting: {
        en: "Connecting…",
        hu: "Kapcsolódás…",
        de: "Verbinden…",
        es: "Conectando…",
    },
    historyLabel: {
        en: "History:",
        hu: "History:",
        de: "Verlauf:",
        es: "Historial:",
    },
    clearHistory: {
        en: "Clear history",
        hu: "Clear history",
        de: "Verlauf löschen",
        es: "Borrar historial",
    },
    hello: {
        en: "Hi — I'm {provider}.",
        hu: "Szia! Én vagyok a {provider}.",
        de: "Hallo — ich bin {provider}.",
        es: "Hola — soy {provider}.",
    },
    helloHint: {
        en: "This conversation is tied to {title}. History will show up here.",
        hu: "Ez a beszélgetés ehhez van kötve: {title}. Itt látod majd az előzményt is.",
        de: "Dieses Gespräch gehört zu {title}. Der Verlauf erscheint hier.",
        es: "Esta conversación está ligada a {title}. El historial aparecerá aquí.",
    },
    you: {
        en: "You",
        hu: "Te",
        de: "Du",
        es: "Tú",
    },
    copy: {
        en: "Copy",
        hu: "Másolás",
        de: "Kopieren",
        es: "Copiar",
    },
    insertChat: {
        en: "Insert into chat",
        hu: "Beszúrás a chatbe",
        de: "In den Chat einfügen",
        es: "Insertar en el chat",
    },
    placeholder: {
        en: "Message {provider}…  Enter to send, Shift+Enter for a new line",
        hu: "Írj {provider}-nak…  Enter küld, Shift+Enter új sor",
        de: "Schreib {provider}…  Enter sendet, Umschalt+Enter neue Zeile",
        es: "Escribe a {provider}…  Enter envía, Mayús+Enter nueva línea",
    },
    wait: {
        en: "Wait…",
        hu: "Várj…",
        de: "Warten…",
        es: "Espera…",
    },
    send: {
        en: "Send",
        hu: "Küldés",
        de: "Senden",
        es: "Enviar",
    },
    openAi: {
        en: "Open AI",
        hu: "AI megnyitása",
        de: "KI öffnen",
        es: "Abrir IA",
    },
    explainWithAi: {
        en: "Explain with AI",
        hu: "Magyarázat AI-val",
        de: "Mit KI erklären",
        es: "Explicar con IA",
    },
    factCheckWithAi: {
        en: "Fact-check with AI",
        hu: "Tényellenőrzés AI-val",
        de: "Fakten mit KI prüfen",
        es: "Verificar hechos con IA",
    },
    updateDesktopOnly: {
        en: "Updates only work on desktop Discord.",
        hu: "A frissítés csak asztali Discordon megy.",
        de: "Updates funktionieren nur in Discord Desktop.",
        es: "Las actualizaciones solo funcionan en Discord de escritorio.",
    },
    updating: {
        en: "Updating AI-Plugin…",
        hu: "AI-Plugin frissítés…",
        de: "AI-Plugin wird aktualisiert…",
        es: "Actualizando AI-Plugin…",
    },
    updatedRestart: {
        en: "AI-Plugin updated. Restart Discord.",
        hu: "AI-Plugin frissítve. Indítsd újra a Discordot.",
        de: "AI-Plugin aktualisiert. Starte Discord neu.",
        es: "AI-Plugin actualizado. Reinicia Discord.",
    },
    updateFailed: {
        en: "Update failed.",
        hu: "Frissítés sikertelen.",
        de: "Update fehlgeschlagen.",
        es: "Error al actualizar.",
    },
    cliConnected: {
        en: "{name} CLI connected",
        hu: "{name} CLI csatlakoztatva",
        de: "{name}-CLI verbunden",
        es: "CLI de {name} conectada",
    },
    cliStatus: {
        en: "AI CLI status",
        hu: "AI CLI státusz",
        de: "KI-CLI-Status",
        es: "Estado de la CLI de IA",
    },
    checking: {
        en: "Checking…",
        hu: "Ellenőrzés…",
        de: "Prüfen…",
        es: "Comprobando…",
    },
    account: {
        en: "Account",
        hu: "Fiók",
        de: "Konto",
        es: "Cuenta",
    },
    githubUpdate: {
        en: "GitHub update",
        hu: "GitHub frissítés",
        de: "GitHub-Update",
        es: "Actualización de GitHub",
    },
    updateAvailable: {
        en: "Update available ({local} → {remote})",
        hu: "Új verzió van ({local} → {remote})",
        de: "Update verfügbar ({local} → {remote})",
        es: "Actualización disponible ({local} → {remote})",
    },
    upToDate: {
        en: "Up to date.",
        hu: "Naprakész.",
        de: "Aktuell.",
        es: "Actualizado.",
    },
    checkFailed: {
        en: "Could not check.",
        hu: "Nem sikerült ellenőrizni.",
        de: "Prüfung fehlgeschlagen.",
        es: "No se pudo comprobar.",
    },
    updateNow: {
        en: "Update now",
        hu: "Frissítés most",
        de: "Jetzt aktualisieren",
        es: "Actualizar ahora",
    },
    updateInProgress: {
        en: "Updating…",
        hu: "Frissítés…",
        de: "Aktualisieren…",
        es: "Actualizando…",
    },
    toolboxUpdate: {
        en: "Update AI-Plugin",
        hu: "AI-Plugin frissítése",
        de: "AI-Plugin aktualisieren",
        es: "Actualizar AI-Plugin",
    },
    thinkingShort: {
        en: "AI is thinking…",
        hu: "Az AI gondolkodik…",
        de: "Die KI denkt nach…",
        es: "La IA está pensando…",
    },
} as const;

export type I18nKey = keyof typeof dict;

export function resolveLang(raw?: string): UiLang {
    if (raw === "hu" || raw === "de" || raw === "es" || raw === "en") return raw;
    return "en";
}

export function t(key: I18nKey, vars?: Record<string, string | number>) {
    const lang = resolveLang(settings.store.language);
    let text: string = dict[key][lang] || dict[key].en;
    if (vars) {
        for (const [name, value] of Object.entries(vars))
            text = text.replaceAll(`{${name}}`, String(value));
    }
    return text;
}
