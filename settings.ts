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
        description: "Which AI to use (local CLI subscription)",
        options: [
            { label: "Grok (xAI)", value: "grok", default: true },
            { label: "Codex (OpenAI / ChatGPT)", value: "codex" },
        ],
    },
    iconPreset: {
        type: OptionType.SELECT,
        description: "AI icon",
        options: [
            { label: "Default", value: "default", default: true },
            { label: "Grok", value: "grok" },
            { label: "OpenAI", value: "openai" },
            { label: "Atom", value: "atom" },
            { label: "Custom SVG", value: "custom" },
        ],
    },
    iconSvg: {
        type: OptionType.STRING,
        multiline: true,
        description: "Custom SVG (only used if Icon is Custom SVG). Paste a full <svg>…</svg> or a <path>. Uses Discord currentColor.",
        hidden() { return this.store.iconPreset !== "custom"; },
        default: "",
        placeholder: '<svg viewBox="0 0 24 24"><path d="M12 2 15 9 22 12 15 15 12 22 9 15 2 12 9 9Z"/></svg>',
    },
    language: {
        type: OptionType.SELECT,
        description: "UI and reply language",
        options: [
            { label: "English", value: "en", default: true },
            { label: "Magyar", value: "hu" },
            { label: "Deutsch", value: "de" },
            { label: "Español", value: "es" },
        ],
    },
    grokModel: {
        type: OptionType.SELECT,
        description: "xAI / Grok model",
        hidden() { return this.store.provider === "codex"; },
        options: [
            { label: "grok-4.6 (default)", value: "grok-4.6", default: true },
            { label: "grok-4.5", value: "grok-4.5" },
        ],
    },
    codexModel: {
        type: OptionType.SELECT,
        description: "OpenAI / Codex model",
        hidden() { return this.store.provider !== "codex"; },
        options: [
            { label: "CLI default", value: "default", default: true },
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
        description: "Allow web search (Grok)",
        hidden() { return this.store.provider === "codex"; },
        default: false,
    },
    includeChannelContext: {
        type: OptionType.BOOLEAN,
        description: "Let the AI read messages from the current Discord chat / DM (summaries, explain context)",
        default: true,
    },
    grokPath: {
        type: OptionType.STRING,
        description: "Custom grok.exe path (empty = auto-detect)",
        hidden() { return this.store.provider === "codex"; },
        default: "",
        placeholder: String.raw`C:\Users\You\.grok\bin\grok.exe`,
    },
    codexPath: {
        type: OptionType.STRING,
        description: "Custom codex.exe path (empty = auto-detect)",
        hidden() { return this.store.provider !== "codex"; },
        default: "",
        placeholder: String.raw`C:\Users\You\AppData\Local\OpenAI\Codex\bin\...\codex.exe`,
    },
    autoUpdate: {
        type: OptionType.BOOLEAN,
        description: "On Discord startup, check GitHub and install AI-Plugin updates (restart required after)",
        default: true,
    },
});
