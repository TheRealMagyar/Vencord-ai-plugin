/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    provider: {
        type: OptionType.SELECT,
        description: "Melyik AI-t használd (helyi CLI előfizetés)",
        options: [
            { label: "Grok (xAI)", value: "grok", default: true },
            { label: "Codex (OpenAI / ChatGPT)", value: "codex" },
        ],
    },
    language: {
        type: OptionType.SELECT,
        description: "UI and Grok reply language / felület és válasz nyelve",
        options: [
            { label: "Automatikus (üzenet nyelve)", value: "auto", default: true },
            { label: "Magyar", value: "hu" },
            { label: "English", value: "en" },
        ],
    },
    model: {
        type: OptionType.SELECT,
        description: "Grok model used by the local CLI",
        options: [
            { label: "grok-4.6 (default)", value: "grok-4.6", default: true },
            { label: "grok-4.5", value: "grok-4.5" },
        ],
    },
    allowWebSearch: {
        type: OptionType.BOOLEAN,
        description: "Allow Grok to use web search when answering",
        default: false,
    },
    includeChannelContext: {
        type: OptionType.BOOLEAN,
        description: "Grok lekérheti a jelenlegi Discord chat / DM üzeneteit (összefoglaló, explain kontextus)",
        default: true,
    },
    grokPath: {
        type: OptionType.STRING,
        description: "Optional custom path to grok.exe / grok (leave empty to auto-detect)",
        default: "",
        placeholder: String.raw`C:\Users\You\.grok\bin\grok.exe`,
    },
    codexPath: {
        type: OptionType.STRING,
        description: "Optional custom path to codex.exe (leave empty to auto-detect)",
        default: "",
        placeholder: String.raw`C:\Users\You\AppData\Local\OpenAI\Codex\bin\...\codex.exe`,
    },
    autoUpdate: {
        type: OptionType.BOOLEAN,
        description: "Discord indításakor ellenőrizze a GitHubot, és telepítse a GrokAi frissítést (újraindítás kell utána)",
        default: true,
    },
});
