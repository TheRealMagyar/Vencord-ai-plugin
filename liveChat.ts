/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { loadThread, persistableMessages, saveThread } from "./history";
import type { AiProvider, ChatMessage, ChatToolStep, GrokReply } from "./types";
import { getNative, t } from "./utils";

export interface LiveJob {
    jobId: string;
    channelId: string;
    title: string;
    provider: AiProvider;
    cancelled: boolean;
    userMessage: ChatMessage;
    assistantMessage: ChatMessage;
    sessionId: string | null;
}

type Listener = () => void;

const jobs = new Map<string, LiveJob>();
const listeners = new Map<string, Set<Listener>>();

function jobKey(channelId: string) {
    return channelId || "__none__";
}

function emit(channelId: string) {
    const set = listeners.get(jobKey(channelId));
    if (!set) return;
    for (const fn of set) {
        try {
            fn();
        } catch {
            // ignore subscriber errors
        }
    }
}

function nextId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function unwrapReplyText(text: string) {
    const trimmed = text.trim();
    if (!trimmed.startsWith("{")) return text;
    try {
        const data = JSON.parse(trimmed) as { text?: unknown; };
        if (typeof data.text === "string" && data.text.trim()) return data.text.trim();
    } catch {
        // keep original
    }
    return text;
}

export function getLiveJob(channelId: string) {
    return jobs.get(jobKey(channelId)) ?? null;
}

export function isChannelBusy(channelId: string) {
    const job = jobs.get(jobKey(channelId));
    return Boolean(job && !job.cancelled);
}

export function subscribeLiveJob(channelId: string, fn: Listener) {
    const key = jobKey(channelId);
    let set = listeners.get(key);
    if (!set) {
        set = new Set();
        listeners.set(key, set);
    }
    set.add(fn);
    return () => {
        set!.delete(fn);
        if (!set!.size) listeners.delete(key);
    };
}

export function mergeLiveMessages(stored: ChatMessage[], live: LiveJob | null) {
    if (!live) return stored;
    const without = stored.filter(msg => msg.id !== live.userMessage.id && msg.id !== live.assistantMessage.id);
    return [...without, live.userMessage, live.assistantMessage];
}

export function cancelLiveJob(channelId: string) {
    const job = jobs.get(jobKey(channelId));
    if (!job) return;
    job.cancelled = true;
    jobs.delete(jobKey(channelId));
    emit(channelId);
}

export async function runLiveChat(opts: {
    channelId: string;
    title: string;
    provider: AiProvider;
    sessionId: string | null;
    visible: string;
    request: (jobId: string) => Promise<GrokReply>;
}): Promise<boolean> {
    if (isChannelBusy(opts.channelId)) return false;

    const Native = getNative();
    const jobId = nextId();
    const job: LiveJob = {
        jobId,
        channelId: opts.channelId,
        title: opts.title,
        provider: opts.provider,
        cancelled: false,
        sessionId: opts.sessionId,
        userMessage: { id: nextId(), role: "user", text: opts.visible, at: Date.now() },
        assistantMessage: {
            id: nextId(),
            role: "assistant",
            text: "",
            pending: true,
            thought: "",
            tools: [],
        },
    };
    jobs.set(jobKey(opts.channelId), job);
    emit(opts.channelId);

    const poll = Native?.getChatProgress
        ? window.setInterval(async () => {
            if (job.cancelled) return;
            try {
                const live = await Native.getChatProgress(jobId);
                if (!live || job.cancelled) return;
                job.assistantMessage = {
                    ...job.assistantMessage,
                    thought: live.thought,
                    tools: live.tools,
                    text: live.text,
                };
                emit(opts.channelId);
            } catch {
                // ignore poll errors
            }
        }, 220)
        : 0;

    try {
        const reply = await opts.request(jobId);
        if (job.cancelled) return true;

        job.sessionId = reply.sessionId || job.sessionId;
        job.assistantMessage = {
            ...job.assistantMessage,
            pending: false,
            error: !reply.ok,
            at: Date.now(),
            thought: reply.thought || "",
            tools: reply.tools || [],
            text: reply.ok
                ? unwrapReplyText(reply.text)
                : (reply.error || t("unknownError")),
        };
        await persistJob(job);
    } catch (error) {
        if (job.cancelled) return true;
        job.assistantMessage = {
            ...job.assistantMessage,
            pending: false,
            error: true,
            at: Date.now(),
            text: error instanceof Error ? error.message : String(error),
        };
        await persistJob(job);
    } finally {
        if (poll) window.clearInterval(poll);
        if (!job.cancelled) jobs.delete(jobKey(opts.channelId));
        emit(opts.channelId);
    }

    return true;
}

async function persistJob(job: LiveJob) {
    if (!job.channelId || job.cancelled) return;

    const stored = await loadThread(job.channelId);
    const sessions = { ...(stored?.sessions ?? {}), [job.provider]: job.sessionId };
    const base = (stored?.messages ?? []).filter(msg =>
        msg.id !== job.userMessage.id && msg.id !== job.assistantMessage.id
    );
    await saveThread({
        channelId: job.channelId,
        title: job.title || stored?.title || "Grok",
        sessionId: sessions.grok ?? job.sessionId,
        sessions,
        messages: persistableMessages([...base, job.userMessage, job.assistantMessage]),
        updatedAt: Date.now(),
    });
}
