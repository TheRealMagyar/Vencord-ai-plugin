/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "./settings";

export type UiLang = "en" | "hu" | "de" | "es";

const dict = {
    desktopOnly: {
        en: "This plugin only works on desktop Discord / Vesktop (local Grok or Codex CLI, or a custom HTTP endpoint).",
        hu: "Ez a plugin csak asztali Discordon / Vesktopon működik (helyi Grok vagy Codex CLI, vagy custom HTTP endpoint).",
        de: "Dieses Plugin funktioniert nur in Discord Desktop / Vesktop (lokale Grok- oder Codex-CLI, oder ein Custom-HTTP-Endpunkt).",
        es: "Este plugin solo funciona en Discord de escritorio / Vesktop (CLI local de Grok o Codex, o un endpoint HTTP personalizado).",
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
        en: "Fact-check this Discord message (marked with >>>). At most 2 web_search calls. Do not use web_fetch. Then write the complete verdict immediately. For each checkable claim: True / Mostly true / Mixed / Mostly false / False / Unverifiable, one short reason, and a source if you have one. If there are no factual claims, say so.\nAuthor: {author}\nChannel: {channel}\nMessage:\n{content}",
        hu: "Ellenőrizd ennek a Discord üzenetnek (>>> jelöli) a tényállításait. Legfeljebb 2 web_search. Ne használj web_fetch-et. Utána azonnal írd meg a teljes ítéletet. Minden ellenőrizhető állításra: Igaz / Többnyire igaz / Vegyes / Többnyire hamis / Hamis / Nem ellenőrizhető, rövid indok, forrás ha van. Ha nincs tényállítás, mondd meg.\nSzerző: {author}\nCsatorna: {channel}\nÜzenet:\n{content}",
        de: "Prüfe die Fakten dieser Discord-Nachricht (mit >>>). Höchstens 2 web_search. Kein web_fetch. Danach sofort das volle Urteil. Pro überprüfbare Behauptung: Wahr / Überwiegend wahr / Gemischt / Überwiegend falsch / Falsch / Nicht überprüfbar, kurze Begründung, Quelle wenn vorhanden. Wenn es keine Faktenbehauptung gibt, sag das.\nAutor: {author}\nKanal: {channel}\nNachricht:\n{content}",
        es: "Verifica los hechos de este mensaje de Discord (marcado con >>>). Como máximo 2 web_search. No uses web_fetch. Luego escribe el veredicto completo de inmediato. Por cada afirmación: Verdadero / Mayormente verdadero / Mixto / Mayormente falso / Falso / No verificable, razón breve y fuente si hay. Si no hay afirmaciones de hecho, dilo.\nAutor: {author}\nCanal: {channel}\nMensaje:\n{content}",
    },
    factCheckPromptQuick: {
        en: "Quick fact-check of this Discord message (marked with >>>). One web_search only. No web_fetch. Then a short verdict right away (a few lines). Verdict: True / Mostly true / Mixed / Mostly false / False / Unverifiable.\nAuthor: {author}\nChannel: {channel}\nMessage:\n{content}",
        hu: "Gyors tényellenőrzés erről a Discord üzenetről (>>>). Csak egy web_search. Nincs web_fetch. Utána rövid ítélet (pár sor). Ítélet: Igaz / Többnyire igaz / Vegyes / Többnyire hamis / Hamis / Nem ellenőrizhető.\nSzerző: {author}\nCsatorna: {channel}\nÜzenet:\n{content}",
        de: "Schnelle Faktenprüfung dieser Discord-Nachricht (>>>). Nur ein web_search. Kein web_fetch. Danach kurzes Urteil (ein paar Zeilen). Urteil: Wahr / Überwiegend wahr / Gemischt / Überwiegend falsch / Falsch / Nicht überprüfbar.\nAutor: {author}\nKanal: {channel}\nNachricht:\n{content}",
        es: "Verificación rápida de este mensaje de Discord (>>>). Solo un web_search. Sin web_fetch. Luego un veredicto corto. Veredicto: Verdadero / Mayormente verdadero / Mixto / Mayormente falso / Falso / No verificable.\nAutor: {author}\nCanal: {channel}\nMensaje:\n{content}",
    },
    factCheckPromptDeep: {
        en: "Thorough fact-check of this Discord message (marked with >>>). Use web_search, and web_fetch only for the most important sources. Then write the complete fact-check. Each checkable claim: True / Mostly true / Mixed / Mostly false / False / Unverifiable, reason, and sources. Note uncertainty.\nAuthor: {author}\nChannel: {channel}\nMessage:\n{content}",
        hu: "Alapos tényellenőrzés erről a Discord üzenetről (>>>). Használj web_search-t, web_fetch-et csak a fontos forrásokhoz. Utána írd meg a teljes ellenőrzést. Minden állítás: Igaz / Többnyire igaz / Vegyes / Többnyire hamis / Hamis / Nem ellenőrizhető, indok, források. Írd le a bizonytalanságot.\nSzerző: {author}\nCsatorna: {channel}\nÜzenet:\n{content}",
        de: "Gründliche Faktenprüfung dieser Discord-Nachricht (>>>). Nutze web_search, web_fetch nur für die wichtigsten Quellen. Danach die vollständige Prüfung. Jede Behauptung: Wahr / Überwiegend wahr / Gemischt / Überwiegend falsch / Falsch / Nicht überprüfbar, Begründung, Quellen. Unsicherheit nennen.\nAutor: {author}\nKanal: {channel}\nNachricht:\n{content}",
        es: "Verificación a fondo de este mensaje de Discord (>>>). Usa web_search, y web_fetch solo en las fuentes más importantes. Luego escribe la verificación completa. Cada afirmación: Verdadero / Mayormente verdadero / Mixto / Mayormente falso / Falso / No verificable, razón y fuentes. Señala la incertidumbre.\nAutor: {author}\nCanal: {channel}\nMensaje:\n{content}",
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
        hu: "Előzmény:",
        de: "Verlauf:",
        es: "Historial:",
    },
    clearHistory: {
        en: "Clear history",
        hu: "Előzmény törlése",
        de: "Verlauf löschen",
        es: "Borrar historial",
    },
    groupDm: {
        en: "Group DM",
        hu: "Csoport",
        de: "Gruppen-DM",
        es: "Grupo",
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
    stop: {
        en: "Stop",
        hu: "Leállítás",
        de: "Stopp",
        es: "Detener",
    },
    interrupted: {
        en: "Stopped.",
        hu: "Leállítva.",
        de: "Gestoppt.",
        es: "Detenido.",
    },
    chatsLabel: {
        en: "Chats",
        hu: "Chatek",
        de: "Chats",
        es: "Chats",
    },
    noChats: {
        en: "No saved chats yet.",
        hu: "Még nincs mentett chat.",
        de: "Noch keine gespeicherten Chats.",
        es: "Aún no hay chats guardados.",
    },
    deleteChat: {
        en: "Delete chat",
        hu: "Chat törlése",
        de: "Chat löschen",
        es: "Borrar chat",
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
    notifyExplainReady: {
        en: "Explanation ready · {title}",
        hu: "Magyarázat kész · {title}",
        de: "Erklärung fertig · {title}",
        es: "Explicación lista · {title}",
    },
    notifyFactCheckReady: {
        en: "Fact-check ready · {title}",
        hu: "Tényellenőrzés kész · {title}",
        de: "Faktenprüfung fertig · {title}",
        es: "Verificación lista · {title}",
    },
    notifyChatReady: {
        en: "{provider} finished · {title}",
        hu: "{provider} kész · {title}",
        de: "{provider} fertig · {title}",
        es: "{provider} terminó · {title}",
    },
    notifyFailed: {
        en: "{provider} failed · {title}",
        hu: "{provider} hibázott · {title}",
        de: "{provider} fehlgeschlagen · {title}",
        es: "{provider} falló · {title}",
    },
    notifyOpenHint: {
        en: "Click to open the AI chat",
        hu: "Kattints az AI chat megnyitásához",
        de: "Klicken, um den KI-Chat zu öffnen",
        es: "Haz clic para abrir el chat de IA",
    },
    notifyBriefingReady: {
        en: "AI notification briefing is ready",
        hu: "Az AI értesítés-összefoglaló kész",
        de: "KI-Benachrichtigungsbriefing ist fertig",
        es: "El resumen de notificaciones está listo",
    },
    notifyBriefingFailed: {
        en: "AI notification briefing failed",
        hu: "Az AI értesítés-összefoglaló sikertelen",
        de: "KI-Benachrichtigungsbriefing fehlgeschlagen",
        es: "El resumen de notificaciones falló",
    },
    factCheckWithAi: {
        en: "Fact-check with AI",
        hu: "Tényellenőrzés AI-val",
        de: "Fakten mit KI prüfen",
        es: "Verificar hechos con IA",
    },
    draftReply: {
        en: "Draft a reply",
        hu: "Válasz tervezése",
        de: "Antwort entwerfen",
        es: "Borrador de respuesta",
    },
    draftVisible: {
        en: "Draft a reply to{author}:\n{content}",
        hu: "Írj választ erre{author}:\n{content}",
        de: "Entwirf eine Antwort auf{author}:\n{content}",
        es: "Redacta una respuesta a{author}:\n{content}",
    },
    draftPrompt: {
        en: "Draft a Discord reply the user can send to this message (marked with >>>). Match the chat's language and tone. Output ONLY the reply text — no quotes, no \"here's a draft\", no explanation.\nAuthor: {author}\nChannel: {channel}\nMessage:\n{content}",
        hu: "Írj egy Discord-választ, amit a felhasználó elküldhet erre az üzenetre (>>>). Illeszkedj a chat nyelvéhez és hangneméhez. CSAK a válasz szövege legyen — sem idézőjel, sem „itt egy piszkozat”, sem magyarázat.\nSzerző: {author}\nCsatorna: {channel}\nÜzenet:\n{content}",
        de: "Entwirf eine Discord-Antwort, die der Nutzer senden kann (>>>). Sprache und Ton des Chats treffen. NUR den Antworttext ausgeben — keine Anführungszeichen, kein „hier ein Entwurf“, keine Erklärung.\nAutor: {author}\nKanal: {channel}\nNachricht:\n{content}",
        es: "Redacta una respuesta de Discord que el usuario pueda enviar (>>>). Sigue el idioma y el tono del chat. SOLO el texto de la respuesta — sin comillas, sin \"aquí un borrador\", sin explicación.\nAutor: {author}\nCanal: {channel}\nMensaje:\n{content}",
    },
    notifyDraftReady: {
        en: "Reply draft ready · {title}",
        hu: "Válaszpiszkozat kész · {title}",
        de: "Antwortentwurf fertig · {title}",
        es: "Borrador listo · {title}",
    },
    summarizeWithAi: {
        en: "Summarize with AI",
        hu: "Összefoglaló AI-val",
        de: "Mit KI zusammenfassen",
        es: "Resumir con IA",
    },
    summarizeHour: {
        en: "Last hour",
        hu: "Elmúlt óra",
        de: "Letzte Stunde",
        es: "Última hora",
    },
    summarizeToday: {
        en: "Today",
        hu: "Ma",
        de: "Heute",
        es: "Hoy",
    },
    summarizeWeek: {
        en: "This week",
        hu: "Ez a hét",
        de: "Diese Woche",
        es: "Esta semana",
    },
    summarizeVisible: {
        en: "Summarize {range} in {title}",
        hu: "Foglald össze: {range} · {title}",
        de: "Fasse zusammen: {range} · {title}",
        es: "Resume {range} en {title}",
    },
    summarizePrompt: {
        en: "Summarize this Discord channel/DM for the period: {range}. Channel: {channel}. {count} message(s) are in the transcript. Lead with anything that needs a reply or decision, then cover the rest in short prose. Do not invent messages. Do not list every line.",
        hu: "Foglald össze ezt a Discord csatornát/DM-et erre az időszakra: {range}. Csatorna: {channel}. {count} üzenet van a transzkriptben. Kezdd azzal, ami választ vagy döntést igényel, aztán rövid prózában a többi. Ne találj ki üzenetet. Ne sorold fel az összes sort.",
        de: "Fasse diesen Discord-Kanal/DM für den Zeitraum zusammen: {range}. Kanal: {channel}. {count} Nachricht(en) im Transkript. Zuerst, was eine Antwort oder Entscheidung braucht, dann der Rest in kurzer Prosa. Keine erfundenen Nachrichten. Keine Zeilenliste.",
        es: "Resume este canal/MD de Discord del periodo: {range}. Canal: {channel}. {count} mensaje(s) en la transcripción. Empieza por lo que necesita respuesta o decisión, luego el resto en prosa breve. No inventes mensajes. No listes cada línea.",
    },
    summarizeEmpty: {
        en: "No messages in that period (or they are not cached yet). Open the channel and try again.",
        hu: "Ebben az időszakban nincs üzenet (vagy még nincs a cache-ben). Nyisd meg a csatornát, és próbáld újra.",
        de: "Keine Nachrichten in diesem Zeitraum (oder noch nicht im Cache). Kanal öffnen und erneut versuchen.",
        es: "No hay mensajes en ese periodo (o aún no están en caché). Abre el canal e inténtalo de nuevo.",
    },
    summarizeFallback: {
        en: "There were no messages in the requested period. Summarize the most recent messages instead, and say they are older than the requested window.",
        hu: "A kért időszakban nincs üzenet. Foglald össze a legutóbbi üzeneteket, és írd le, hogy régebbiek, mint a kért ablak.",
        de: "Im gewünschten Zeitraum gab es keine Nachrichten. Fasse stattdessen die neuesten Nachrichten zusammen und sag, dass sie älter sind.",
        es: "No hubo mensajes en el periodo pedido. Resume los más recientes y di que son anteriores a esa ventana.",
    },
    notifySummarizeReady: {
        en: "Channel summary ready · {title}",
        hu: "Csatorna-összefoglaló kész · {title}",
        de: "Kanalzusammenfassung fertig · {title}",
        es: "Resumen del canal listo · {title}",
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
    endpointConnected: {
        en: "{name} endpoint connected",
        hu: "{name} endpoint csatlakoztatva",
        de: "{name}-Endpunkt verbunden",
        es: "Endpoint de {name} conectado",
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
    notifCenter: {
        en: "AI notifications",
        hu: "AI értesítések",
        de: "KI-Benachrichtigungen",
        es: "Notificaciones de IA",
    },
    notifCount: {
        en: "{count} mention(s)",
        hu: "{count} említés",
        de: "{count} Erwähnung(en)",
        es: "{count} mención(es)",
    },
    notifEmpty: {
        en: "No mention pings right now.",
        hu: "Most nincs ping.",
        de: "Keine Erwähnungen gerade.",
        es: "No hay menciones ahora.",
    },
    notifIdle: {
        en: "Click Summarize with AI to write a briefing of your mention pings.",
        hu: "Nyomj az Összesítés AI-val gombra, ha kéred a briefinget.",
        de: "Klicke auf Mit KI zusammenfassen, um das Briefing zu schreiben.",
        es: "Pulsa Resumir con IA para escribir el resumen.",
    },
    notifOpen: {
        en: "Open",
        hu: "Megnyitás",
        de: "Öffnen",
        es: "Abrir",
    },
    notifSummarize: {
        en: "Summarize with AI",
        hu: "Összesítés AI-val",
        de: "Mit KI zusammenfassen",
        es: "Resumir con IA",
    },
    notifRefresh: {
        en: "Refresh briefing",
        hu: "Összefoglaló frissítése",
        de: "Briefing aktualisieren",
        es: "Actualizar el resumen",
    },
    notifSummarizing: {
        en: "Summarizing…",
        hu: "Összesítés…",
        de: "Zusammenfassen…",
        es: "Resumiendo…",
    },
    notifReading: {
        en: "Reading mention messages…",
        hu: "Említések olvasása…",
        de: "Erwähnungen werden gelesen…",
        es: "Leyendo menciones…",
    },
    notifSummary: {
        en: "AI summary",
        hu: "AI összefoglaló",
        de: "KI-Zusammenfassung",
        es: "Resumen de IA",
    },
    notifDelete: {
        en: "Clear this ping",
        hu: "Ping törlése",
        de: "Ping löschen",
        es: "Borrar este ping",
    },
    notifDeleteAll: {
        en: "Clear all",
        hu: "Mind törlése",
        de: "Alle löschen",
        es: "Borrar todo",
    },
    notifDm: {
        en: "Direct message",
        hu: "Privát üzenet",
        de: "Direktnachricht",
        es: "Mensaje directo",
    },
    notifNeedCli: {
        en: "Connect Grok, Codex, or a custom endpoint in settings first.",
        hu: "Előbb csatlakoztasd a Grok / Codex CLI-t vagy a custom endpointot a beállításokban.",
        de: "Verbinde zuerst Grok, Codex oder einen Custom-Endpunkt in den Einstellungen.",
        es: "Conecta primero Grok, Codex o un endpoint personalizado en ajustes.",
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
