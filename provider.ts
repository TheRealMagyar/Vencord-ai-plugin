/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "./settings";
import type { AiProvider, ChatMessage, ChatRequest, ChatTurn, CustomApiStyle, CustomEndpoint } from "./types";

const MAX_HISTORY = 24;
const MAX_TURN_CHARS = 8_000;

export function resolveProvider(raw?: string | null): AiProvider {
    if (raw === "codex" || raw === "custom") return raw;
    return "grok";
}

export function currentProvider(): AiProvider {
    return resolveProvider(settings.store.provider);
}

export function providerLabel(provider: AiProvider = currentProvider()): string {
    if (provider === "codex") return "Codex";
    if (provider === "custom") return "Custom";
    return "Grok";
}

export function selectedModel(provider: AiProvider = currentProvider()): string | undefined {
    if (provider === "codex") {
        const model = settings.store.codexModel;
        return model && model !== "default" ? model : undefined;
    }
    if (provider === "custom") {
        const model = settings.store.customModel?.trim();
        return model || undefined;
    }
    return settings.store.grokModel || undefined;
}

export function customApiStyle(): CustomApiStyle {
    return settings.store.customApiStyle === "anthropic" ? "anthropic" : "openai";
}

export function customEndpoint(): CustomEndpoint {
    return {
        baseUrl: settings.store.customBaseUrl?.trim() || undefined,
        apiKey: settings.store.customApiKey?.trim() || undefined,
        apiStyle: customApiStyle(),
        model: selectedModel("custom"),
    };
}

export function historyForRequest(messages: ChatMessage[]): ChatTurn[] {
    return messages
        .filter(msg => (msg.role === "user" || msg.role === "assistant") && !msg.pending && Boolean(msg.text.trim()))
        .slice(-MAX_HISTORY)
        .map(msg => ({
            role: msg.role as "user" | "assistant",
            content: msg.text.length > MAX_TURN_CHARS ? msg.text.slice(0, MAX_TURN_CHARS) : msg.text,
        }));
}

export function chatProviderFields(provider: AiProvider = currentProvider()): Pick<
    ChatRequest,
    "provider" | "model" | "grokPath" | "codexPath" | "customBaseUrl" | "customApiKey" | "customApiStyle"
> {
    const custom = provider === "custom" ? customEndpoint() : null;
    return {
        provider,
        model: selectedModel(provider),
        grokPath: settings.store.grokPath || undefined,
        codexPath: settings.store.codexPath || undefined,
        customBaseUrl: custom?.baseUrl,
        customApiKey: custom?.apiKey,
        customApiStyle: custom?.apiStyle,
    };
}
