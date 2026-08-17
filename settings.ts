/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

function formatTokenMark(value: number) {
    const n = Math.round(value);
    if (n >= 1024 && n % 1024 === 0) return `${n / 1024}k`;
    return String(n);
}

export const settings = definePluginSettings({
    provider: {
        type: OptionType.SELECT,
        description: "Which AI to use (local CLI or a custom HTTP endpoint)",
        options: [
            { label: "Grok (xAI)", value: "grok", default: true },
            { label: "Codex (OpenAI / ChatGPT)", value: "codex" },
            { label: "Custom (local / API)", value: "custom" },
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
        hidden() { return this.store.provider !== "grok"; },
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
    customApiStyle: {
        type: OptionType.SELECT,
        description: "Custom endpoint type",
        hidden() { return this.store.provider !== "custom"; },
        options: [
            { label: "OpenAI-compatible (Ollama, LM Studio, vLLM, llama.cpp, OpenAI)", value: "openai", default: true },
            { label: "Anthropic-compatible (Claude, LiteLLM, local Anthropic)", value: "anthropic" },
        ],
    },
    customBaseUrl: {
        type: OptionType.STRING,
        description: "Custom base URL. Examples: http://127.0.0.1:11434/v1 (Ollama), http://127.0.0.1:1234/v1 (LM Studio), https://api.openai.com/v1, https://api.anthropic.com",
        hidden() { return this.store.provider !== "custom"; },
        default: "http://127.0.0.1:11434/v1",
        placeholder: "http://127.0.0.1:11434/v1",
    },
    customModel: {
        type: OptionType.STRING,
        description: "Custom model name (whatever the local server or API expects)",
        hidden() { return this.store.provider !== "custom"; },
        default: "",
        placeholder: "llama3.2",
    },
    customApiKey: {
        type: OptionType.STRING,
        description: "API key (optional for most local servers). Stored in Equicord settings, never logged.",
        hidden() { return this.store.provider !== "custom"; },
        default: "",
        placeholder: "sk-… or leave empty",
    },
    customMaxTokens: {
        type: OptionType.SLIDER,
        description: "Max tokens per custom reply. Lower is faster and less likely to loop. Draft, chat, and summarize all use this.",
        hidden() { return this.store.provider !== "custom"; },
        default: 1024,
        markers: [256, 512, 1024, 2048, 4096, 8192],
        stickToMarkers: false,
        componentProps: {
            onValueRender: formatTokenMark,
            onMarkerRender: formatTokenMark,
        },
    },
    allowWebSearch: {
        type: OptionType.BOOLEAN,
        description: "Allow web search (Grok)",
        hidden() { return this.store.provider !== "grok"; },
        default: false,
    },
    showThinking: {
        type: OptionType.BOOLEAN,
        description: "Show thinking and tool use (web search, etc.) while the AI works",
        default: true,
    },
    factCheckDepth: {
        type: OptionType.SELECT,
        description: "How deep fact-check should go (more depth is slower)",
        options: [
            { label: "Quick — 1 search, short verdict", value: "quick" },
            { label: "Balanced — 2 searches, no page fetch (default)", value: "balanced", default: true },
            { label: "Deep — more searches + read sources", value: "deep" },
        ],
    },
    includeChannelContext: {
        type: OptionType.BOOLEAN,
        description: "Let the AI read messages from the current Discord chat / DM (summaries, explain, fact-check context)",
        default: true,
    },
    grokPath: {
        type: OptionType.STRING,
        description: "Custom grok.exe path (empty = auto-detect)",
        hidden() { return this.store.provider !== "grok"; },
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
    showNotificationCenter: {
        type: OptionType.BOOLEAN,
        description: "Show the AI notification center next to Direct Messages (restart required)",
        default: true,
        restartNeeded: true,
    },
    autoUpdate: {
        type: OptionType.BOOLEAN,
        description: "On Discord startup, check GitHub and install AI-Plugin updates (restart required after)",
        default: true,
    },
});
