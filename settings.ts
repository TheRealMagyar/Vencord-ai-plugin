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
        description: "UI és válasz nyelve",
        options: [
            { label: "Automatikus (üzenet nyelve)", value: "auto", default: true },
            { label: "Magyar", value: "hu" },
            { label: "English", value: "en" },
        ],
    },
    grokModel: {
        type: OptionType.SELECT,
        description: "xAI / Grok modell",
        hidden() { return this.store.provider === "codex"; },
        options: [
            { label: "grok-4.6 (default)", value: "grok-4.6", default: true },
            { label: "grok-4.5", value: "grok-4.5" },
        ],
    },
    codexModel: {
        type: OptionType.SELECT,
        description: "OpenAI / Codex modell",
        hidden() { return this.store.provider !== "codex"; },
        options: [
            { label: "CLI alapértelmezett", value: "default", default: true },
            { label: "GPT-5.6-Sol", value: "gpt-5.6-sol" },
            { label: "GPT-5.6-Terra", value: "gpt-5.6-terra" },
            { label: "GPT-5.6-Luna", value: "gpt-5.6-luna" },
            { label: "GPT-5.5", value: "gpt-5.5" },
            { label: "GPT-5.4", value: "gpt-5.4" },
            { label: "GPT-5.4-Mini", value: "gpt-5.4-mini" },
        ],
    },
    allowWebSearch: {
        type: OptionType.BOOLEAN,
        description: "Webes keresés engedélyezése (Grok)",
        hidden() { return this.store.provider === "codex"; },
        default: false,
    },
    includeChannelContext: {
        type: OptionType.BOOLEAN,
        description: "Az AI lekérheti a jelenlegi Discord chat / DM üzeneteit (összefoglaló, explain kontextus)",
        default: true,
    },
    grokPath: {
        type: OptionType.STRING,
        description: "Egyedi grok.exe útvonal (üresen auto-detect)",
        hidden() { return this.store.provider === "codex"; },
        default: "",
        placeholder: String.raw`C:\Users\You\.grok\bin\grok.exe`,
    },
    codexPath: {
        type: OptionType.STRING,
        description: "Egyedi codex.exe útvonal (üresen auto-detect)",
        hidden() { return this.store.provider !== "codex"; },
        default: "",
        placeholder: String.raw`C:\Users\You\AppData\Local\OpenAI\Codex\bin\...\codex.exe`,
    },
    autoUpdate: {
        type: OptionType.BOOLEAN,
        description: "Discord indításakor ellenőrizze a GitHubot, és telepítse az AI-Plugin frissítést (újraindítás kell utána)",
        default: true,
    },
});
