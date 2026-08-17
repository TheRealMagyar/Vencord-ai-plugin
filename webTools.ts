/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { AiJobKind, ChatToolStep, FactCheckDepth } from "./types";

const SEARCH_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MAX_FETCH_BYTES = 400_000;
const MAX_FETCH_CHARS = 8_000;
const MAX_SNIPPET = 280;
const MAX_RESULTS = 6;

export interface WebToolCall {
    id: string;
    name: string;
    args: Record<string, string>;
}

export interface WebToolBudget {
    search: boolean;
    fetch: boolean;
    maxSearch: number;
    maxFetch: number;
    maxRounds: number;
}

export interface WebToolSpend {
    search: number;
    fetch: number;
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|::1|\[::1\]|metadata\.google\.internal)/i;

export function webToolBudget(kind?: AiJobKind, depth?: FactCheckDepth, allowWebSearch?: boolean): WebToolBudget | null {
    if (kind === "draft" || kind === "explain" || kind === "summarize")
        return null;
    if (kind === "factcheck") {
        if (depth === "quick")
            return { search: true, fetch: false, maxSearch: 1, maxFetch: 0, maxRounds: 3 };
        if (depth === "deep")
            return { search: true, fetch: true, maxSearch: 3, maxFetch: 3, maxRounds: 7 };
        return { search: true, fetch: false, maxSearch: 2, maxFetch: 0, maxRounds: 4 };
    }
    if (allowWebSearch)
        return { search: true, fetch: true, maxSearch: 3, maxFetch: 2, maxRounds: 6 };
    return null;
}

export const OPENAI_WEB_TOOLS = [
    {
        type: "function",
        function: {
            name: "web_search",
            description: "Search the public web. Use for current facts, news, quotes, or anything you are not sure about.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Search query" },
                },
                required: ["query"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "web_fetch",
            description: "Download a public https page and return the readable text.",
            parameters: {
                type: "object",
                properties: {
                    url: { type: "string", description: "Full http(s) URL" },
                },
                required: ["url"],
            },
        },
    },
] as const;

export const ANTHROPIC_WEB_TOOLS = [
    {
        name: "web_search",
        description: "Search the public web. Use for current facts, news, quotes, or anything you are not sure about.",
        input_schema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Search query" },
            },
            required: ["query"],
        },
    },
    {
        name: "web_fetch",
        description: "Download a public https page and return the readable text.",
        input_schema: {
            type: "object",
            properties: {
                url: { type: "string", description: "Full http(s) URL" },
            },
            required: ["url"],
        },
    },
] as const;

export function xmlToolInstructions(budget: WebToolBudget) {
    const names = [
        budget.search ? "web_search" : null,
        budget.fetch ? "web_fetch" : null,
    ].filter(Boolean).join(" and ");
    return [
        `You have optional tools: ${names}. Use them only for live facts, news, quotes, or a page you must read.`,
        "Do not search for greetings, drafts, or questions you can already answer.",
        "After tool results arrive, write the complete answer. No more tools unless you still lack a source.",
        "If native tool calls are unavailable, emit:",
        '<tool_call>{"name":"web_search","arguments":{"query":"..."}}</tool_call>',
        budget.fetch ? '<tool_call>{"name":"web_fetch","arguments":{"url":"https://..."}}</tool_call>' : "",
    ].filter(Boolean).join(" ");
}

function decodeEntities(raw: string) {
    return raw
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
            const code = Number.parseInt(hex, 16);
            return Number.isFinite(code) ? String.fromCodePoint(code) : "";
        })
        .replace(/&#(\d+);/g, (_, num) => {
            const code = Number(num);
            return Number.isFinite(code) ? String.fromCodePoint(code) : "";
        });
}

function stripTags(raw: string) {
    return decodeEntities(raw.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function htmlToText(html: string) {
    const without = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<(br|p|div|h[1-6]|li|tr|section|article)(\s[^>]*)?>/gi, "\n");
    return decodeEntities(without.replace(/<[^>]+>/g, " "))
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

function unwrapDdgHref(href: string) {
    try {
        const url = new URL(href, "https://duckduckgo.com");
        const uddg = url.searchParams.get("uddg");
        if (uddg) return decodeURIComponent(uddg);
        return url.href;
    } catch {
        return href;
    }
}

function publicUrl(raw: string) {
    try {
        const url = new URL(raw.trim());
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
        const host = url.hostname.replace(/^\[|\]$/g, "");
        if (PRIVATE_HOST.test(host) || PRIVATE_HOST.test(url.hostname)) return null;
        return url;
    } catch {
        return null;
    }
}

function parseDdgHtml(html: string) {
    const hits: { title: string; url: string; snippet: string; }[] = [];
    const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html)) && hits.length < MAX_RESULTS) {
        const url = unwrapDdgHref(decodeEntities(match[1]));
        if (!publicUrl(url)) continue;
        const after = html.slice(match.index, match.index + 1200);
        const snippetMatch = after.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/i);
        hits.push({
            title: stripTags(match[2]).slice(0, 160) || url,
            url,
            snippet: snippetMatch ? stripTags(snippetMatch[1]).slice(0, MAX_SNIPPET) : "",
        });
    }
    return hits;
}

async function searchDuckDuckGo(query: string, signal: AbortSignal) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
        headers: {
            "user-agent": SEARCH_UA,
            accept: "text/html",
        },
        signal,
    });
    if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
    return parseDdgHtml(await res.text());
}

async function searchWikipedia(query: string, signal: AbortSignal) {
    const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=4&namespace=0&format=json`;
    const res = await fetch(url, {
        headers: { "user-agent": SEARCH_UA, accept: "application/json" },
        signal,
    });
    if (!res.ok) return [];
    const data = await res.json() as unknown;
    if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
    const titles = data[1] as unknown[];
    const descs = Array.isArray(data[2]) ? data[2] as unknown[] : [];
    const links = Array.isArray(data[3]) ? data[3] as unknown[] : [];
    const hits: { title: string; url: string; snippet: string; }[] = [];
    for (let i = 0; i < titles.length && hits.length < 4; i++) {
        const href = typeof links[i] === "string" ? links[i] : "";
        if (!publicUrl(href)) continue;
        hits.push({
            title: String(titles[i] ?? "").slice(0, 160),
            url: href,
            snippet: String(descs[i] ?? "").slice(0, MAX_SNIPPET),
        });
    }
    return hits;
}

export async function runWebSearch(query: string, signal: AbortSignal) {
    const q = query.trim();
    if (!q) return "Search failed: empty query.";
    let hits: { title: string; url: string; snippet: string; }[] = [];
    try {
        hits = await searchDuckDuckGo(q, signal);
    } catch {
        hits = [];
    }
    if (!hits.length) {
        try {
            hits = await searchWikipedia(q, signal);
        } catch {
            hits = [];
        }
    }
    if (!hits.length)
        return `No search results for: ${q}`;
    return hits.map((hit, i) => `${i + 1}. ${hit.title}\n${hit.url}\n${hit.snippet}`).join("\n\n");
}

async function followPublic(url: URL, signal: AbortSignal) {
    let current = url;
    for (let hop = 0; hop < 4; hop++) {
        const res = await fetch(current.href, {
            headers: {
                "user-agent": SEARCH_UA,
                accept: "text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8",
            },
            redirect: "manual",
            signal,
        });
        if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get("location");
            if (!loc) throw new Error(`Redirect without location (${res.status})`);
            const next = publicUrl(new URL(loc, current).href);
            if (!next) throw new Error("Redirected to a blocked URL.");
            current = next;
            continue;
        }
        return res;
    }
    throw new Error("Too many redirects.");
}

export async function runWebFetch(rawUrl: string, signal: AbortSignal) {
    const url = publicUrl(rawUrl);
    if (!url) return "Fetch failed: only public http(s) URLs are allowed.";
    const res = await followPublic(url, signal);
    if (!res.ok) return `Fetch failed: HTTP ${res.status} for ${url.href}`;
    const buf = new Uint8Array(await res.arrayBuffer());
    const sliced = buf.byteLength > MAX_FETCH_BYTES ? buf.slice(0, MAX_FETCH_BYTES) : buf;
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(sliced);
    const type = (res.headers.get("content-type") || "").toLowerCase();
    let text = type.includes("html") || /<html|<body|<div/i.test(raw)
        ? htmlToText(raw)
        : raw.replace(/\s+/g, " ").trim();
    if (text.length > MAX_FETCH_CHARS)
        text = `${text.slice(0, MAX_FETCH_CHARS)}\n…[truncated]`;
    if (!text) return `Fetch returned no readable text: ${url.href}`;
    return `URL: ${url.href}\n\n${text}`;
}

function asRecord(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: Record<string, string> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        if (typeof item === "string" && item.trim()) out[key] = item.trim();
        else if (typeof item === "number" || typeof item === "boolean") out[key] = String(item);
    }
    return out;
}

export function parseOpenAiToolCalls(message: Record<string, unknown> | undefined): WebToolCall[] {
    const raw = message?.tool_calls;
    if (!Array.isArray(raw)) return [];
    const calls: WebToolCall[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const fn = rec.function as Record<string, unknown> | undefined;
        const name = typeof fn?.name === "string" ? fn.name : typeof rec.name === "string" ? rec.name : "";
        if (!name) continue;
        let args: Record<string, string> = {};
        if (typeof fn?.arguments === "string") {
            try {
                args = asRecord(JSON.parse(fn.arguments));
            } catch {
                args = { query: fn.arguments, url: fn.arguments };
            }
        } else if (fn?.arguments && typeof fn.arguments === "object") {
            args = asRecord(fn.arguments);
        } else if (rec.arguments && typeof rec.arguments === "object") {
            args = asRecord(rec.arguments);
        }
        calls.push({
            id: typeof rec.id === "string" && rec.id ? rec.id : `call_${calls.length + 1}`,
            name,
            args,
        });
    }
    return calls;
}

export function parseAnthropicToolCalls(data: Record<string, unknown>): WebToolCall[] {
    const content = data.content;
    if (!Array.isArray(content)) return [];
    const calls: WebToolCall[] = [];
    for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const rec = block as Record<string, unknown>;
        if (rec.type !== "tool_use") continue;
        const name = typeof rec.name === "string" ? rec.name : "";
        if (!name) continue;
        calls.push({
            id: typeof rec.id === "string" && rec.id ? rec.id : `call_${calls.length + 1}`,
            name,
            args: asRecord(rec.input),
        });
    }
    return calls;
}

export function parseXmlToolCalls(text: string): WebToolCall[] {
    const calls: WebToolCall[] = [];
    const re = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
        const body = match[1].trim();
        try {
            const parsed = JSON.parse(body) as Record<string, unknown>;
            const name = typeof parsed.name === "string" ? parsed.name : "";
            if (!name) continue;
            calls.push({
                id: `xml_${calls.length + 1}`,
                name,
                args: asRecord(parsed.arguments ?? parsed),
            });
            continue;
        } catch {
            // qwen key/value form
        }
        const name = body.match(/^([A-Za-z0-9_]+)/)?.[1] || "";
        if (!name) continue;
        const args: Record<string, string> = {};
        const kv = /<arg_key>\s*([^<]+)\s*<\/arg_key>\s*<arg_value>\s*([\s\S]*?)\s*<\/arg_value>/gi;
        let pair: RegExpExecArray | null;
        while ((pair = kv.exec(body)))
            args[pair[1].trim()] = pair[2].trim();
        if (!Object.keys(args).length) {
            const q = body.replace(name, "").trim();
            if (q) args.query = q;
        }
        calls.push({ id: `xml_${calls.length + 1}`, name, args });
    }
    return calls;
}

export function stripToolXml(text: string) {
    return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "").trim();
}

export async function executeWebTool(
    call: WebToolCall,
    budget: WebToolBudget,
    spend: WebToolSpend,
    signal: AbortSignal,
    onTool?: (step: ChatToolStep) => void,
): Promise<string> {
    const name = call.name.toLowerCase().replace(/[^a-z_]/g, "");
    const isSearch = name === "web_search" || name === "search" || name.endsWith("_search");
    const isFetch = name === "web_fetch" || name === "web_browse" || name === "fetch" || name.endsWith("_fetch");

    if (isSearch) {
        if (!budget.search || spend.search >= budget.maxSearch)
            return "web_search budget reached. Write the answer now from the results you already have.";
        const query = call.args.query || call.args.q || Object.values(call.args)[0] || "";
        spend.search++;
        onTool?.({ id: call.id, name: "web_search", status: "running", detail: query });
        try {
            const result = await runWebSearch(query, signal);
            onTool?.({ id: call.id, name: "web_search", status: "done", detail: query });
            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onTool?.({ id: call.id, name: "web_search", status: "error", detail: message });
            return `Search failed: ${message}`;
        }
    }

    if (isFetch) {
        if (!budget.fetch || spend.fetch >= budget.maxFetch)
            return "web_fetch is not allowed for this request, or the fetch budget is used up. Write the answer now.";
        const url = call.args.url || call.args.href || Object.values(call.args)[0] || "";
        spend.fetch++;
        onTool?.({ id: call.id, name: "web_fetch", status: "running", detail: url });
        try {
            const result = await runWebFetch(url, signal);
            onTool?.({ id: call.id, name: "web_fetch", status: "done", detail: url });
            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onTool?.({ id: call.id, name: "web_fetch", status: "error", detail: message });
            return `Fetch failed: ${message}`;
        }
    }

    return `Unknown tool: ${call.name}. Available: web_search${budget.fetch ? ", web_fetch" : ""}.`;
}
