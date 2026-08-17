/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { ChatTurn, CustomApiStyle, GrokStatus } from "./types";
import { nativeT } from "./nativeI18n";

export interface CustomChatOpts {
    style: CustomApiStyle;
    baseUrl: string;
    apiKey?: string;
    model: string;
    system: string;
    messages: ChatTurn[];
    signal: AbortSignal;
    onText: (full: string) => void;
    onThought?: (full: string) => void;
}

function asText(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function normalizeBaseUrl(raw: string) {
    return raw.trim().replace(/\/+$/, "");
}

export function isHttpUrl(raw: string) {
    try {
        const url = new URL(raw.trim());
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

function joinUrl(base: string, suffix: string) {
    const trimmed = normalizeBaseUrl(base);
    if (trimmed.toLowerCase().endsWith(suffix.toLowerCase())) return trimmed;
    return `${trimmed}${suffix}`;
}

export function openaiChatUrl(base: string) {
    const trimmed = normalizeBaseUrl(base);
    if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
    if (/\/v\d+$/i.test(trimmed)) return `${trimmed}/chat/completions`;
    return joinUrl(trimmed, "/v1/chat/completions");
}

export function openaiModelsUrl(base: string) {
    const trimmed = normalizeBaseUrl(base);
    if (/\/chat\/completions$/i.test(trimmed)) return trimmed.replace(/\/chat\/completions$/i, "/models");
    if (/\/v\d+$/i.test(trimmed)) return `${trimmed}/models`;
    return joinUrl(trimmed, "/v1/models");
}

export function anthropicMessagesUrl(base: string) {
    const trimmed = normalizeBaseUrl(base);
    if (/\/messages$/i.test(trimmed)) return trimmed;
    if (/\/v\d+$/i.test(trimmed)) return `${trimmed}/messages`;
    return joinUrl(trimmed, "/v1/messages");
}

export function anthropicModelsUrl(base: string) {
    const trimmed = normalizeBaseUrl(base);
    if (/\/messages$/i.test(trimmed)) return trimmed.replace(/\/messages$/i, "/models");
    if (/\/v\d+$/i.test(trimmed)) return `${trimmed}/models`;
    return joinUrl(trimmed, "/v1/models");
}

function openaiHeaders(apiKey?: string) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    return headers;
}

function anthropicHeaders(apiKey?: string) {
    const headers: Record<string, string> = {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
    };
    if (apiKey) {
        headers["x-api-key"] = apiKey;
        headers.authorization = `Bearer ${apiKey}`;
    }
    return headers;
}

function errorFromBody(raw: string, status: number) {
    try {
        const data = JSON.parse(raw) as Record<string, unknown>;
        const err = data.error;
        if (typeof err === "string" && err.trim()) return err.trim();
        if (err && typeof err === "object") {
            const rec = err as Record<string, unknown>;
            const msg = asText(rec.message) || asText(rec.type);
            if (msg) return msg;
        }
        const msg = asText(data.message) || asText(data.detail);
        if (msg) return msg;
    } catch {
        // use raw
    }
    const clipped = raw.trim().replace(/\s+/g, " ").slice(0, 280);
    return clipped || `HTTP ${status}`;
}

function userAssistantTurns(messages: ChatTurn[]) {
    const turns: { role: "user" | "assistant"; content: string; }[] = [];
    for (const msg of messages) {
        if (msg.role !== "user" && msg.role !== "assistant") continue;
        const content = msg.content.trim();
        if (!content) continue;
        const last = turns[turns.length - 1];
        if (last && last.role === msg.role) {
            last.content = `${last.content}\n\n${content}`;
            continue;
        }
        turns.push({ role: msg.role, content });
    }
    if (turns[0]?.role === "assistant")
        turns.unshift({ role: "user", content: "(continued)" });
    if (!turns.length)
        turns.push({ role: "user", content: "Hello" });
    return turns;
}

async function readSse(res: Response, onEvent: (event: string, data: string) => void) {
    const body = res.body;
    if (!body) {
        const text = await res.text();
        onEvent("message", text);
        return;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let event = "message";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? "";
        for (const line of lines) {
            if (!line || line.startsWith(":")) continue;
            if (line.startsWith("event:")) {
                event = line.slice(6).trim() || "message";
                continue;
            }
            if (line.startsWith("data:")) {
                onEvent(event, line.slice(5).trim());
                event = "message";
            }
        }
    }
}

function applyOpenAiDelta(data: string, acc: { text: string; thought: string; }, onText: (full: string) => void, onThought?: (full: string) => void) {
    if (!data || data === "[DONE]") return;
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(data) as Record<string, unknown>;
    } catch {
        return;
    }
    const choices = parsed.choices;
    const choice = Array.isArray(choices) ? choices[0] as Record<string, unknown> | undefined : undefined;
    const delta = (choice?.delta ?? choice?.message ?? parsed.delta) as Record<string, unknown> | undefined;
    const content = asText(delta?.content) || asText(parsed.content);
    if (content) {
        acc.text += typeof delta?.content === "string" ? delta.content : content;
        onText(acc.text);
    }
    const thought = asText(delta?.reasoning_content) || asText(delta?.reasoning) || asText(delta?.thinking);
    if (thought && onThought) {
        acc.thought += typeof delta?.reasoning_content === "string"
            ? String(delta.reasoning_content)
            : typeof delta?.reasoning === "string"
                ? String(delta.reasoning)
                : thought;
        onThought(acc.thought);
    }
}

function applyAnthropicEvent(event: string, data: string, acc: { text: string; thought: string; }, onText: (full: string) => void, onThought?: (full: string) => void) {
    if (!data || data === "[DONE]") return;
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(data) as Record<string, unknown>;
    } catch {
        return;
    }
    const type = asText(parsed.type) || event;
    if (type === "content_block_delta" || type === "message") {
        const delta = parsed.delta as Record<string, unknown> | undefined;
        const text = asText(delta?.text);
        if (text) {
            acc.text += typeof delta?.text === "string" ? delta.text : text;
            onText(acc.text);
        }
        const thought = asText(delta?.thinking) || asText(delta?.partial_json);
        if (thought && onThought) {
            acc.thought += typeof delta?.thinking === "string" ? delta.thinking : thought;
            onThought(acc.thought);
        }
    }
}

function textFromOpenAiJson(data: Record<string, unknown>) {
    const choices = data.choices;
    if (Array.isArray(choices)) {
        for (const choice of choices) {
            if (!choice || typeof choice !== "object") continue;
            const rec = choice as Record<string, unknown>;
            const message = rec.message as Record<string, unknown> | undefined;
            const content = asText(message?.content) || asText(rec.text);
            if (content) return content;
        }
    }
    return asText(data.content) || asText(data.output_text);
}

function textFromAnthropicJson(data: Record<string, unknown>) {
    const content = data.content;
    if (Array.isArray(content)) {
        const parts: string[] = [];
        for (const block of content) {
            if (!block || typeof block !== "object") continue;
            const rec = block as Record<string, unknown>;
            const text = asText(rec.text);
            if (text) parts.push(text);
        }
        if (parts.length) return parts.join("");
    }
    return asText(data.text);
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal) {
    const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
    });
    return res;
}

export async function runCustomChat(opts: CustomChatOpts): Promise<{ text: string; thought: string; }> {
    const acc = { text: "", thought: "" };
    const turns = userAssistantTurns(opts.messages);
    const style = opts.style === "anthropic" ? "anthropic" : "openai";

    if (style === "anthropic") {
        const url = anthropicMessagesUrl(opts.baseUrl);
        const res = await postJson(url, anthropicHeaders(opts.apiKey), {
            model: opts.model,
            max_tokens: 4096,
            system: opts.system,
            messages: turns.map(turn => ({ role: turn.role, content: turn.content })),
            stream: true,
        }, opts.signal);

        if (!res.ok) {
            throw new Error(errorFromBody(await res.text().catch(() => ""), res.status));
        }

        const ct = (res.headers.get("content-type") || "").toLowerCase();
        if (ct.includes("application/json") && !ct.includes("event-stream")) {
            const data = await res.json() as Record<string, unknown>;
            acc.text = textFromAnthropicJson(data);
            opts.onText(acc.text);
            return acc;
        }

        await readSse(res, (event, data) => applyAnthropicEvent(event, data, acc, opts.onText, opts.onThought));
        return acc;
    }

    const url = openaiChatUrl(opts.baseUrl);
    const res = await postJson(url, openaiHeaders(opts.apiKey), {
        model: opts.model,
        messages: [
            { role: "system", content: opts.system },
            ...turns.map(turn => ({ role: turn.role, content: turn.content })),
        ],
        stream: true,
    }, opts.signal);

    if (!res.ok) {
        throw new Error(errorFromBody(await res.text().catch(() => ""), res.status));
    }

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json") && !ct.includes("event-stream")) {
        const data = await res.json() as Record<string, unknown>;
        acc.text = textFromOpenAiJson(data);
        opts.onText(acc.text);
        return acc;
    }

    await readSse(res, (_event, data) => applyOpenAiDelta(data, acc, opts.onText, opts.onThought));
    return acc;
}

export async function probeCustomEndpoint(opts: {
    baseUrl?: string;
    apiKey?: string;
    apiStyle?: CustomApiStyle;
    model?: string;
    language?: string;
}): Promise<GrokStatus> {
    const lang = opts.language;
    const base = opts.baseUrl?.trim() || "";
    const model = opts.model?.trim() || "";
    const style = opts.apiStyle === "anthropic" ? "anthropic" : "openai";
    const styleLabel = style === "anthropic" ? "Anthropic" : "OpenAI";

    if (!base) {
        return {
            installed: false,
            authenticated: false,
            grokPath: null,
            version: null,
            displayName: null,
            subscription: null,
            authMode: style,
            expiresAt: null,
            error: nativeT(lang, "customNoUrl"),
        };
    }

    if (!isHttpUrl(base)) {
        return {
            installed: false,
            authenticated: false,
            grokPath: null,
            version: null,
            displayName: model || null,
            subscription: null,
            authMode: style,
            expiresAt: null,
            error: nativeT(lang, "customBadUrl"),
        };
    }

    const chatUrl = style === "anthropic" ? anthropicMessagesUrl(base) : openaiChatUrl(base);
    const modelsUrl = style === "anthropic" ? anthropicModelsUrl(base) : openaiModelsUrl(base);
    const headers = style === "anthropic" ? anthropicHeaders(opts.apiKey) : openaiHeaders(opts.apiKey);

    let reachable = false;
    let unauthorized = false;
    let probeError = "";

    try {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 8_000);
        try {
            const res = await fetch(modelsUrl, { method: "GET", headers, signal: ac.signal });
            reachable = true;
            if (res.status === 401 || res.status === 403) unauthorized = true;
            else if (!res.ok && res.status !== 404 && res.status !== 405)
                probeError = errorFromBody(await res.text().catch(() => ""), res.status);
        } finally {
            clearTimeout(timer);
        }
    } catch (error) {
        const aborted = error instanceof Error && error.name === "AbortError";
        probeError = aborted
            ? nativeT(lang, "customUnreachable")
            : nativeT(lang, "customUnreachable");
    }

    if (!reachable) {
        return {
            installed: false,
            authenticated: false,
            grokPath: chatUrl,
            version: styleLabel,
            displayName: model || null,
            subscription: null,
            authMode: style,
            expiresAt: null,
            error: probeError || nativeT(lang, "customUnreachable"),
        };
    }

    if (!model) {
        return {
            installed: true,
            authenticated: false,
            grokPath: chatUrl,
            version: styleLabel,
            displayName: null,
            subscription: `${styleLabel}-compatible`,
            authMode: style,
            expiresAt: null,
            error: nativeT(lang, "customNoModel"),
        };
    }

    if (unauthorized) {
        return {
            installed: true,
            authenticated: false,
            grokPath: chatUrl,
            version: styleLabel,
            displayName: model,
            subscription: `${styleLabel}-compatible`,
            authMode: style,
            expiresAt: null,
            error: nativeT(lang, "customBadKey"),
        };
    }

    return {
        installed: true,
        authenticated: true,
        grokPath: chatUrl,
        version: styleLabel,
        displayName: model,
        subscription: `${styleLabel} · ${model}`,
        authMode: style,
        expiresAt: null,
        error: null,
    };
}
