/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { AiJobKind, ChatToolStep, ChatTurn, CustomApiStyle, GrokStatus } from "./types";
import { nativeT } from "./nativeI18n";
import {
    ANTHROPIC_WEB_TOOLS,
    executeWebTool,
    OPENAI_WEB_TOOLS,
    parseAnthropicToolCalls,
    parseOpenAiToolCalls,
    parseXmlToolCalls,
    stripToolXml,
    xmlToolInstructions,
    type WebToolBudget,
    type WebToolCall,
    type WebToolSpend,
} from "./webTools";

export interface CustomChatOpts {
    style: CustomApiStyle;
    baseUrl: string;
    apiKey?: string;
    model: string;
    system: string;
    messages: ChatTurn[];
    signal: AbortSignal;
    kind?: AiJobKind;
    maxTokens?: number;
    tools?: WebToolBudget | null;
    onText: (full: string) => void;
    onThought?: (full: string) => void;
    onTool?: (step: ChatToolStep) => void;
}

const DEFAULT_STOP = ["<|im_end|>", "<|endoftext|>", "<|eot_id|>", "</s>", "<|end|>"];

export function customMaxTokens(kind?: AiJobKind) {
    if (kind === "draft") return 400;
    if (kind === "explain") return 900;
    if (kind === "summarize") return 1200;
    if (kind === "factcheck") return 1400;
    return 2048;
}

export function clampMaxTokens(raw?: number) {
    if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
    return Math.min(8192, Math.max(64, Math.round(raw)));
}

function wantsThinking(kind?: AiJobKind) {
    return kind !== "draft" && kind !== "explain" && kind !== "summarize";
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

async function readSse(res: Response, onEvent: (event: string, data: string) => "done" | "loop" | void) {
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

    const stop = async () => {
        try {
            await reader.cancel();
        } catch {
            // ignore
        }
    };

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
                const verdict = onEvent(event, line.slice(5).trim());
                event = "message";
                if (verdict === "loop" || verdict === "done") {
                    await stop();
                    return;
                }
            }
        }
    }
}

function splitThink(raw: string) {
    const openTag = /<think>/i;
    const closeTag = /<\/think>/i;
    const open = raw.search(openTag);
    if (open < 0) return { text: raw, thought: "" };
    const afterOpen = raw.slice(open).replace(openTag, "");
    const close = afterOpen.search(closeTag);
    if (close < 0)
        return { text: raw.slice(0, open), thought: afterOpen };
    return {
        text: `${raw.slice(0, open)}${afterOpen.slice(close).replace(closeTag, "")}`,
        thought: afterOpen.slice(0, close),
    };
}

function trimRepeatedTail(text: string) {
    for (const size of [32, 48, 64, 96, 128]) {
        if (text.length < size * 3) continue;
        const unit = text.slice(-size);
        if (!unit.trim()) continue;
        if (text.slice(-size * 3) !== unit.repeat(3)) continue;
        let cut = text.length;
        while (cut >= size && text.slice(cut - size, cut) === unit) cut -= size;
        return text.slice(0, cut + size);
    }
    return text;
}

function looksLikeLoop(text: string) {
    return trimRepeatedTail(text) !== text;
}

function publishCustom(acc: { text: string; thought: string; raw: string; }, onText: (full: string) => void, onThought?: (full: string) => void) {
    const split = splitThink(acc.raw);
    acc.text = trimRepeatedTail(split.text);
    if (split.thought.trim())
        acc.thought = clipThoughtLocal(split.thought);
    onText(acc.text);
    if (acc.thought && onThought) onThought(acc.thought);
}

function clipThoughtLocal(text: string) {
    if (text.length <= 6_000) return text;
    return text.slice(text.length - 6_000);
}

function applyOpenAiDelta(data: string, acc: { text: string; thought: string; raw: string; }, onText: (full: string) => void, onThought?: (full: string) => void) {
    if (!data || data === "[DONE]") return "done";
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(data) as Record<string, unknown>;
    } catch {
        return;
    }
    const choices = parsed.choices;
    const choice = Array.isArray(choices) ? choices[0] as Record<string, unknown> | undefined : undefined;
    const delta = (choice?.delta ?? parsed.delta) as Record<string, unknown> | undefined;
    const piece = typeof delta?.content === "string" ? delta.content : "";
    if (piece) acc.raw += piece;

    const thoughtPiece = typeof delta?.reasoning_content === "string"
        ? delta.reasoning_content
        : typeof delta?.reasoning === "string"
            ? delta.reasoning
            : typeof delta?.thinking === "string"
                ? delta.thinking
                : "";
    if (thoughtPiece) acc.thought += thoughtPiece;

    if (piece || thoughtPiece) publishCustom(acc, onText, onThought);
    if (looksLikeLoop(acc.raw) || looksLikeLoop(acc.thought)) return "loop";
    return;
}

function applyAnthropicEvent(event: string, data: string, acc: { text: string; thought: string; raw: string; }, onText: (full: string) => void, onThought?: (full: string) => void) {
    if (!data || data === "[DONE]") return "done";
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(data) as Record<string, unknown>;
    } catch {
        return;
    }
    const type = asText(parsed.type) || event;
    if (type === "content_block_delta" || type === "message") {
        const delta = parsed.delta as Record<string, unknown> | undefined;
        const piece = typeof delta?.text === "string" ? delta.text : "";
        if (piece) acc.raw += piece;
        const thoughtPiece = typeof delta?.thinking === "string" ? delta.thinking : "";
        if (thoughtPiece) acc.thought += thoughtPiece;
        if (piece || thoughtPiece) publishCustom(acc, onText, onThought);
        if (looksLikeLoop(acc.raw) || looksLikeLoop(acc.thought)) return "loop";
    }
    return;
}

function openAiMessage(data: Record<string, unknown>) {
    const choices = data.choices;
    if (Array.isArray(choices)) {
        for (const choice of choices) {
            if (!choice || typeof choice !== "object") continue;
            const rec = choice as Record<string, unknown>;
            if (rec.message && typeof rec.message === "object")
                return rec.message as Record<string, unknown>;
        }
    }
    return null;
}

function contentToString(value: unknown): string {
    if (typeof value === "string") return value;
    if (!Array.isArray(value)) return "";
    const parts: string[] = [];
    for (const item of value) {
        if (typeof item === "string") {
            parts.push(item);
            continue;
        }
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const type = typeof rec.type === "string" ? rec.type : "";
        if (type === "thinking" || type === "reasoning") continue;
        if (typeof rec.text === "string") parts.push(rec.text);
        else if (typeof rec.content === "string") parts.push(rec.content);
    }
    return parts.join("");
}

function thoughtFromMessage(message: Record<string, unknown> | null) {
    if (!message) return "";
    return contentToString(message.reasoning_content)
        || contentToString(message.reasoning)
        || contentToString(message.thinking)
        || "";
}

function textFromOpenAiJson(data: Record<string, unknown>) {
    const message = openAiMessage(data);
    if (message) {
        const content = contentToString(message.content) || contentToString(message.text);
        if (content.trim()) return content;
    }
    const choices = data.choices;
    if (Array.isArray(choices)) {
        for (const choice of choices) {
            if (!choice || typeof choice !== "object") continue;
            const rec = choice as Record<string, unknown>;
            const content = contentToString(rec.text);
            if (content.trim()) return content;
        }
    }
    return contentToString(data.content) || contentToString(data.output_text);
}

function answerFromReasoning(thought: string) {
    const trimmed = thought.trim();
    if (!trimmed) return "";
    const paras = trimmed.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const last = paras.at(-1) || trimmed;
    return last.length >= 8 ? last : trimmed;
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

function finishCustom(acc: { text: string; thought: string; raw: string; }, onText: (full: string) => void, onThought?: (full: string) => void) {
    if (!acc.raw && acc.text) acc.raw = acc.text;
    publishCustom(acc, onText, onThought);
    acc.text = acc.text.trim();
    acc.thought = acc.thought.trim();
    if (!acc.text && acc.thought)
        acc.text = answerFromReasoning(acc.thought);
    onText(acc.text);
    return { text: acc.text, thought: acc.thought };
}

function collectToolCalls(text: string, official: WebToolCall[]) {
    if (official.length) return official;
    return parseXmlToolCalls(text);
}

async function runToolRound(
    calls: WebToolCall[],
    budget: WebToolBudget,
    spend: WebToolSpend,
    signal: AbortSignal,
    onTool?: (step: ChatToolStep) => void,
) {
    const results: { call: WebToolCall; result: string; }[] = [];
    for (const call of calls) {
        const result = await executeWebTool(call, budget, spend, signal, onTool);
        results.push({ call, result });
    }
    return results;
}

function allowedOpenAiTools(budget: WebToolBudget) {
    return OPENAI_WEB_TOOLS.filter(tool => {
        if (tool.function.name === "web_search") return budget.search;
        if (tool.function.name === "web_fetch") return budget.fetch;
        return false;
    });
}

function allowedAnthropicTools(budget: WebToolBudget) {
    return ANTHROPIC_WEB_TOOLS.filter(tool => {
        if (tool.name === "web_search") return budget.search;
        if (tool.name === "web_fetch") return budget.fetch;
        return false;
    });
}

async function completeOpenAi(opts: {
    url: string;
    apiKey?: string;
    model: string;
    messages: Record<string, unknown>[];
    maxTokens: number;
    thinking: boolean;
    tools?: WebToolBudget | null;
    nativeTools: boolean;
    signal: AbortSignal;
}): Promise<{ text: string; thought: string; toolCalls: WebToolCall[]; nativeTools: boolean; }> {
    const body: Record<string, unknown> = {
        model: opts.model,
        messages: opts.messages,
        stream: false,
        max_tokens: opts.maxTokens,
        max_completion_tokens: opts.maxTokens,
        stop: DEFAULT_STOP,
        frequency_penalty: 0.4,
        repeat_penalty: 1.15,
        chat_template_kwargs: { enable_thinking: opts.thinking },
        enable_thinking: opts.thinking,
    };
    if (opts.tools && opts.nativeTools) {
        body.tools = allowedOpenAiTools(opts.tools);
        body.tool_choice = "auto";
    }

    let res = await postJson(opts.url, openaiHeaders(opts.apiKey), body, opts.signal);
    if (!res.ok && res.status === 400) {
        await res.text().catch(() => "");
        const fallback: Record<string, unknown> = {
            model: opts.model,
            messages: opts.messages,
            stream: false,
            max_tokens: opts.maxTokens,
            stop: DEFAULT_STOP,
        };
        if (opts.tools && opts.nativeTools) {
            fallback.tools = body.tools;
            fallback.tool_choice = "auto";
        }
        res = await postJson(opts.url, openaiHeaders(opts.apiKey), fallback, opts.signal);
        if (!res.ok && res.status === 400 && opts.nativeTools && opts.tools) {
            await res.text().catch(() => "");
            return completeOpenAi({ ...opts, nativeTools: false });
        }
    }
    if (!res.ok)
        throw new Error(errorFromBody(await res.text().catch(() => ""), res.status));

    const data = await res.json() as Record<string, unknown>;
    const message = openAiMessage(data);
    const text = textFromOpenAiJson(data);
    const thought = thoughtFromMessage(message);
    const official = parseOpenAiToolCalls(message ?? undefined);
    const toolCalls = collectToolCalls(text, official);
    return {
        text: toolCalls.length ? stripToolXml(text) : text,
        thought,
        toolCalls,
        nativeTools: opts.nativeTools && official.length > 0,
    };
}

async function completeAnthropic(opts: {
    url: string;
    apiKey?: string;
    model: string;
    system: string;
    messages: Record<string, unknown>[];
    maxTokens: number;
    tools?: WebToolBudget | null;
    nativeTools: boolean;
    signal: AbortSignal;
}): Promise<{ text: string; thought: string; toolCalls: WebToolCall[]; nativeTools: boolean; data: Record<string, unknown>; }> {
    const body: Record<string, unknown> = {
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages: opts.messages,
        stream: false,
    };
    if (opts.tools && opts.nativeTools)
        body.tools = allowedAnthropicTools(opts.tools);

    let res = await postJson(opts.url, anthropicHeaders(opts.apiKey), body, opts.signal);
    if (!res.ok && res.status === 400 && opts.nativeTools && opts.tools) {
        await res.text().catch(() => "");
        return completeAnthropic({ ...opts, nativeTools: false });
    }
    if (!res.ok)
        throw new Error(errorFromBody(await res.text().catch(() => ""), res.status));

    const data = await res.json() as Record<string, unknown>;
    const text = textFromAnthropicJson(data);
    const official = parseAnthropicToolCalls(data);
    const toolCalls = collectToolCalls(text, official);
    return {
        text: toolCalls.length ? stripToolXml(text) : text,
        thought: "",
        toolCalls,
        nativeTools: opts.nativeTools && official.length > 0,
        data,
    };
}

export async function runCustomChat(opts: CustomChatOpts): Promise<{ text: string; thought: string; }> {
    const acc = { text: "", thought: "", raw: "" };
    const turns = userAssistantTurns(opts.messages);
    const style = opts.style === "anthropic" ? "anthropic" : "openai";
    const maxTokens = clampMaxTokens(opts.maxTokens) ?? customMaxTokens(opts.kind);
    const thinking = wantsThinking(opts.kind);
    const budget = opts.tools ?? null;
    const system = budget ? `${opts.system} ${xmlToolInstructions(budget)}` : opts.system;

    if (budget) {
        const spend: WebToolSpend = { search: 0, fetch: 0 };
        if (style === "anthropic") {
            const url = anthropicMessagesUrl(opts.baseUrl);
            const messages: Record<string, unknown>[] = turns.map(turn => ({ role: turn.role, content: turn.content }));
            let nativeTools = true;
            for (let round = 0; round < budget.maxRounds; round++) {
                const done = await completeAnthropic({
                    url,
                    apiKey: opts.apiKey,
                    model: opts.model,
                    system,
                    messages,
                    maxTokens,
                    tools: budget,
                    nativeTools,
                    signal: opts.signal,
                });
                nativeTools = done.nativeTools || nativeTools && Boolean(done.toolCalls.length && done.nativeTools);
                if (!done.toolCalls.length) {
                    acc.raw = done.text;
                    acc.thought = done.thought || acc.thought;
                    return finishCustom(acc, opts.onText, opts.onThought);
                }
                const results = await runToolRound(done.toolCalls, budget, spend, opts.signal, opts.onTool);
                if (done.nativeTools) {
                    messages.push({ role: "assistant", content: done.data.content ?? done.text });
                    messages.push({
                        role: "user",
                        content: results.map(item => ({
                            type: "tool_result",
                            tool_use_id: item.call.id,
                            content: item.result,
                        })),
                    });
                } else {
                    messages.push({ role: "assistant", content: done.text || `<tool_call>${done.toolCalls[0].name}</tool_call>` });
                    messages.push({
                        role: "user",
                        content: results.map(item => `TOOL RESULT (${item.call.name}):\n${item.result}`).join("\n\n"),
                    });
                }
            }
            acc.raw = "Tool budget reached. Try a shorter question, or raise max tokens.";
            return finishCustom(acc, opts.onText, opts.onThought);
        }

        const url = openaiChatUrl(opts.baseUrl);
        const messages: Record<string, unknown>[] = [
            { role: "system", content: system },
            ...turns.map(turn => ({ role: turn.role, content: turn.content })),
        ];
        let nativeTools = true;
        let usedTools = false;
        for (let round = 0; round < budget.maxRounds; round++) {
            const budgetLeft = spend.search < budget.maxSearch || spend.fetch < budget.maxFetch;
            const allowTools = !usedTools || (round < budget.maxRounds - 1 && budgetLeft);
            const done = await completeOpenAi({
                url,
                apiKey: opts.apiKey,
                model: opts.model,
                messages,
                maxTokens,
                thinking: usedTools ? false : thinking,
                tools: allowTools ? budget : null,
                nativeTools: allowTools ? nativeTools : false,
                signal: opts.signal,
            });
            if (done.thought) acc.thought = done.thought;
            if (done.toolCalls.length && !done.nativeTools)
                nativeTools = false;
            if (!done.toolCalls.length) {
                acc.raw = done.text || acc.raw;
                acc.thought = done.thought || acc.thought;
                if (!acc.raw.trim() && acc.thought.trim()) {
                    const forced = await completeOpenAi({
                        url,
                        apiKey: opts.apiKey,
                        model: opts.model,
                        messages: [
                            ...messages,
                            { role: "user", content: "Write the final answer only. No tools. No chain-of-thought." },
                        ],
                        maxTokens,
                        thinking: false,
                        tools: null,
                        nativeTools: false,
                        signal: opts.signal,
                    });
                    acc.raw = forced.text;
                    acc.thought = forced.thought || acc.thought;
                }
                return finishCustom(acc, opts.onText, opts.onThought);
            }
            usedTools = true;
            const results = await runToolRound(done.toolCalls, budget, spend, opts.signal, opts.onTool);
            if (done.nativeTools) {
                messages.push({
                    role: "assistant",
                    content: done.text || null,
                    tool_calls: done.toolCalls.map(call => ({
                        id: call.id,
                        type: "function",
                        function: { name: call.name, arguments: JSON.stringify(call.args) },
                    })),
                });
                for (const item of results) {
                    messages.push({
                        role: "tool",
                        tool_call_id: item.call.id,
                        content: item.result,
                    });
                }
                messages.push({
                    role: "user",
                    content: "Write the complete answer now from the tool results. No more tools.",
                });
            } else {
                messages.push({ role: "assistant", content: done.text || `<tool_call>${JSON.stringify({ name: done.toolCalls[0].name, arguments: done.toolCalls[0].args })}</tool_call>` });
                messages.push({
                    role: "user",
                    content: results.map(item => `TOOL RESULT (${item.call.name}):\n${item.result}`).join("\n\n") + "\n\nWrite the complete answer now. No more tools.",
                });
            }
        }
        acc.raw = acc.raw || "Tool budget reached. Try a shorter question, or raise max tokens.";
        return finishCustom(acc, opts.onText, opts.onThought);
    }

    if (style === "anthropic") {
        const url = anthropicMessagesUrl(opts.baseUrl);
        const res = await postJson(url, anthropicHeaders(opts.apiKey), {
            model: opts.model,
            max_tokens: maxTokens,
            system,
            messages: turns.map(turn => ({ role: turn.role, content: turn.content })),
            stream: true,
        }, opts.signal);

        if (!res.ok) {
            throw new Error(errorFromBody(await res.text().catch(() => ""), res.status));
        }

        const ct = (res.headers.get("content-type") || "").toLowerCase();
        if (ct.includes("application/json") && !ct.includes("event-stream")) {
            const data = await res.json() as Record<string, unknown>;
            acc.raw = textFromAnthropicJson(data);
            return finishCustom(acc, opts.onText, opts.onThought);
        }

        await readSse(res, (event, data) => applyAnthropicEvent(event, data, acc, opts.onText, opts.onThought));
        return finishCustom(acc, opts.onText, opts.onThought);
    }

    const url = openaiChatUrl(opts.baseUrl);
    const messages = [
        { role: "system", content: system },
        ...turns.map(turn => ({ role: turn.role, content: turn.content })),
    ];
    const richBody = {
        model: opts.model,
        messages,
        stream: true,
        max_tokens: maxTokens,
        max_completion_tokens: maxTokens,
        stop: DEFAULT_STOP,
        frequency_penalty: 0.4,
        repeat_penalty: 1.15,
        chat_template_kwargs: { enable_thinking: thinking },
        enable_thinking: thinking,
    };
    const plainBody = {
        model: opts.model,
        messages,
        stream: true,
        max_tokens: maxTokens,
        stop: DEFAULT_STOP,
    };

    let res = await postJson(url, openaiHeaders(opts.apiKey), richBody, opts.signal);
    if (!res.ok && res.status === 400) {
        await res.text().catch(() => "");
        res = await postJson(url, openaiHeaders(opts.apiKey), plainBody, opts.signal);
    }
    if (!res.ok) {
        throw new Error(errorFromBody(await res.text().catch(() => ""), res.status));
    }

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("application/json") && !ct.includes("event-stream")) {
        const data = await res.json() as Record<string, unknown>;
        acc.raw = textFromOpenAiJson(data);
        return finishCustom(acc, opts.onText, opts.onThought);
    }

    await readSse(res, (_event, data) => applyOpenAiDelta(data, acc, opts.onText, opts.onThought));
    return finishCustom(acc, opts.onText, opts.onThought);
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
