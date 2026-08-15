/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChannelStore, MessageStore, RestAPI } from "@webpack/common";

export interface TranscriptLine {
    id: string;
    author: string;
    content: string;
    timestamp: number;
}

export interface PackedContext {
    transcript: string;
    count: number;
    days: number | null;
    deep: boolean;
    fallback?: boolean;
}

const MAX_CHARS = 70_000;

function snowflakeTime(id: string) {
    try {
        return Number((BigInt(id) >> 22n) + 1420070400000n);
    } catch {
        return Date.now();
    }
}

function authorName(raw: any) {
    const user = raw?.author ?? raw;
    return user?.globalName || user?.username || user?.name || "Unknown";
}

function messageBody(raw: any) {
    const parts: string[] = [];
    const content = raw?.content || raw?.messageSnapshots?.[0]?.message?.content || "";
    if (content) parts.push(String(content));

    for (const file of raw?.attachments ?? []) {
        if (file?.filename) parts.push(`[file: ${file.filename}]`);
    }
    for (const embed of raw?.embeds ?? []) {
        if (embed?.title) parts.push(`[embed: ${embed.title}]`);
        if (embed?.description) parts.push(String(embed.description).slice(0, 240));
    }
    if (raw?.stickerItems?.length || raw?.stickers?.length) parts.push("[sticker]");
    return parts.join(" ").replace(/\s+/g, " ").trim();
}

function toLine(raw: any): TranscriptLine | null {
    const id = raw?.id;
    if (!id) return null;
    const content = messageBody(raw);
    if (!content) return null;
    const ts = raw?.timestamp
        ? new Date(typeof raw.timestamp === "object" && raw.timestamp.valueOf
            ? raw.timestamp.valueOf()
            : raw.timestamp).getTime()
        : snowflakeTime(id);
    return {
        id: String(id),
        author: authorName(raw),
        content: content.slice(0, 1500),
        timestamp: Number.isFinite(ts) ? ts : snowflakeTime(id),
    };
}

function fromStore(channelId: string) {
    try {
        const bucket = MessageStore.getMessages(channelId) as any;
        const arr: any[] = bucket?._array
            ?? bucket?.toArray?.()
            ?? (bucket?._map ? Object.values(bucket._map) : []);
        return arr.map(toLine).filter((line): line is TranscriptLine => Boolean(line));
    } catch {
        return [];
    }
}

async function fetchPage(channelId: string, query: Record<string, string | number>) {
    const res = await RestAPI.get({
        url: `/channels/${channelId}/messages`,
        query,
        retries: 1,
    });
    const body = res?.body;
    if (Array.isArray(body)) return body;
    if (Array.isArray(body?.messages)) return body.messages;
    return [];
}

export function detectHistoryNeed(prompt: string) {
    const p = prompt.toLowerCase();
    const wantsHistory = /foglal(d|ja)|összefoglal|summariz|summáz|recap|áttekint|zusammenfass|erkl[aä]r|resum(e|en)|explica|mi volt|mit besz[eé]lt|el[oö]zm[eé]ny|besz[eé]lget[eé]s|conversation|history|verlauf|historial|üzenetek|chatet|itt (mi|mit)|context/.test(p);
    if (/egy\s*h[oó]nap|last\s*month|múlt\s*h[oó]nap|letzten?\s*monat|el\s*mes/.test(p)) return { deep: true, days: 30 };
    if (/egy\s*h[eé]t|heti|last\s*week|past\s*week|múlt\s*h[eé]t|elmúlt\s*h[eé]t|7\s*nap|this\s*week|letzte\s*woche|esta\s*semana/.test(p)) return { deep: true, days: 7 };
    if (/tegnap|yesterday|gestern|ayer/.test(p)) return { deep: true, days: 1 };
    if (/ma\b|today|heute|hoy|24\s*[oó]ra/.test(p) && wantsHistory) return { deep: true, days: 1 };
    if (wantsHistory) return { deep: true, days: 3 };
    return { deep: false, days: null as number | null };
}

export async function collectChannelMessages(opts: {
    channelId: string;
    aroundId?: string;
    days?: number | null;
    hours?: number | null;
    deep?: boolean;
    max?: number;
}): Promise<{ lines: TranscriptLine[]; fallback: boolean; }> {
    const max = opts.max ?? (opts.deep ? 250 : 50);
    const since = opts.hours
        ? Date.now() - opts.hours * 3_600_000
        : opts.days
            ? Date.now() - opts.days * 86_400_000
            : 0;
    const seen = new Map<string, TranscriptLine>();

    for (const line of fromStore(opts.channelId)) seen.set(line.id, line);

    let before: string | undefined;
    let around = opts.aroundId;
    if (!around && !before) {
        try {
            around = ChannelStore.getChannel(opts.channelId)?.lastMessageId
                || MessageStore.getLastMessage(opts.channelId)?.id
                || undefined;
        } catch {
            around = undefined;
        }
    }
    let pages = 0;
    const pageLimit = opts.deep ? 10 : 2;

    try {
        while (seen.size < max && pages < pageLimit) {
            const query: Record<string, string | number> = { limit: 100 };
            if (around) query.around = around;
            else if (before) query.before = before;

            const raw = await fetchPage(opts.channelId, query);
            around = undefined;
            pages++;
            if (!raw.length) break;

            for (const item of raw) {
                const line = toLine(item);
                if (line) seen.set(line.id, line);
            }

            const oldest = raw.reduce((a, b) => (String(a.id) < String(b.id) ? a : b));
            before = String(oldest.id);
            if (since && snowflakeTime(before) < since) break;
            if (raw.length < 50) break;
        }
    } catch {
        // store cache is still usable
    }

    const all = [...seen.values()].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
    const inWindow = since ? all.filter(line => line.timestamp >= since) : all;
    if (inWindow.length)
        return { lines: inWindow.slice(-max), fallback: false };
    return { lines: all.slice(-Math.min(max, 80)), fallback: all.length > 0 };
}

export function formatTranscript(lines: TranscriptLine[], highlightId?: string) {
    const text = lines.map(line => {
        const stamp = new Date(line.timestamp).toLocaleString();
        const mark = highlightId && line.id === highlightId ? " >>>" : "";
        return `[${stamp}] ${line.author}${mark}: ${line.content}`;
    }).join("\n");

    if (text.length <= MAX_CHARS) return text;
    return text.slice(text.length - MAX_CHARS);
}

export async function packChannelContext(opts: {
    channelId: string;
    prompt: string;
    aroundId?: string;
    highlightId?: string;
    enabled?: boolean;
    max?: number;
    days?: number | null;
    hours?: number | null;
    deep?: boolean;
}): Promise<PackedContext> {
    if (!opts.enabled || !opts.channelId) {
        return { transcript: "", count: 0, days: null, deep: false, fallback: false };
    }

    const explicitWindow = opts.hours != null || opts.days != null;
    const need = explicitWindow
        ? { deep: opts.deep ?? true, days: opts.days ?? null }
        : opts.aroundId
            ? { deep: true, days: null as number | null }
            : detectHistoryNeed(opts.prompt);
    const { lines, fallback } = await collectChannelMessages({
        channelId: opts.channelId,
        aroundId: opts.aroundId,
        days: need.days,
        hours: opts.hours,
        deep: need.deep || Boolean(opts.aroundId) || explicitWindow,
        max: opts.max ?? (opts.aroundId ? 80 : need.deep || explicitWindow ? 250 : 45),
    });

    return {
        transcript: formatTranscript(lines, opts.highlightId),
        count: lines.length,
        days: need.days,
        deep: need.deep || Boolean(opts.aroundId),
        fallback,
    };
}

export function withTranscript(userPrompt: string, packed: PackedContext, kind: "chat" | "explain" | "factcheck" | "draft" | "summarize") {
    if (!packed.transcript) return userPrompt;

    const header = kind === "explain"
        ? "Below is nearby Discord chat history. The target message is marked with >>>. Use this context to explain it accurately. Do not invent messages."
        : kind === "factcheck"
            ? "Below is nearby Discord chat history. The target message is marked with >>>. Use this context to understand the claim, then fact-check it. Do not invent messages."
            : kind === "draft"
                ? "Below is nearby Discord chat history. The target message is marked with >>>. Draft a reply the user can send. Match tone and language. Output only the reply text — no quotes, no preamble."
                : kind === "summarize"
                    ? "Below is Discord chat history from this channel/DM. Summarize what happened. Do not invent messages."
                    : "Below is Discord chat history from the current channel/DM. Use it as ground truth when the user asks about this conversation. Do not invent messages that are not listed.";

    return [
        header,
        "",
        "--- Discord transcript ---",
        packed.transcript,
        "--- end transcript ---",
        "",
        "User request:",
        userPrompt,
    ].join("\n");
}
