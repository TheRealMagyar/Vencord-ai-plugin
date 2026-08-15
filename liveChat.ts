/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { showToast, Toasts } from "@webpack/common";

import { loadThread, persistableMessages, saveThread } from "./history";
import type { AiProvider, ChatMessage, ChatToolStep, GrokReply } from "./types";
import { getNative, t } from "./utils";

export type LiveJobKind = "chat" | "explain" | "factcheck";

export interface LiveJob {
    jobId: string;
    channelId: string;
    title: string;
    provider: AiProvider;
    kind: LiveJobKind;
    cancelled: boolean;
    userMessage: ChatMessage;
    assistantMessage: ChatMessage;
    sessionId: string | null;
}

type Listener = () => void;

const jobs = new Map<string, LiveJob>();
const listeners = new Map<string, Set<Listener>>();
const allListeners = new Set<Listener>();
let openWindows = 0;
let openChat: ((channelId: string) => void) | null = null;

export function setChatWindowOpen(open: boolean) {
    openWindows = Math.max(0, openWindows + (open ? 1 : -1));
}

export function isChatWindowOpen() {
    return openWindows > 0;
}

export function setOpenChatHandler(fn: ((channelId: string) => void) | null) {
    openChat = fn;
}

function notifyJobDone(job: LiveJob, ok: boolean) {
    if (isChatWindowOpen()) return;

    const title = job.title || "Discord";
    const provider = job.provider === "codex" ? "Codex" : "Grok";
    const message = !ok
        ? t("notifyFailed", { provider, title })
        : job.kind === "explain"
            ? t("notifyExplainReady", { title })
            : job.kind === "factcheck"
                ? t("notifyFactCheckReady", { title })
                : t("notifyChatReady", { provider, title });

    showToast(message, ok ? Toasts.Type.SUCCESS : Toasts.Type.FAILURE);
    try {
        void showNotification({
            title: message,
            body: t("notifyOpenHint"),
            onClick: () => openChat?.(job.channelId),
        });
    } catch {
        // toast is enough
    }
}

function jobKey(channelId: string) {
    return channelId || "__none__";
}

function emit(channelId: string, broadcast = true) {
    const set = listeners.get(jobKey(channelId));
    if (set) {
        for (const fn of set) {
            try {
                fn();
            } catch {
                // ignore subscriber errors
            }
        }
    }
    if (!broadcast) return;
    for (const fn of allListeners) {
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

export function subscribeAllJobs(fn: Listener) {
    allListeners.add(fn);
    return () => {
        allListeners.delete(fn);
    };
}

export function listLiveJobs() {
    return [...jobs.values()].filter(job => !job.cancelled);
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
    const Native = getNative();
    void Native?.cancelChat?.(job.jobId).catch(() => { /* ignore */ });
    jobs.delete(jobKey(channelId));
    emit(channelId);
}

export async function interruptLiveJob(channelId: string) {
    const job = jobs.get(jobKey(channelId));
    if (!job || job.cancelled) return;
    job.cancelled = true;
    const Native = getNative();
    try {
        await Native?.cancelChat?.(job.jobId);
    } catch {
        // process may already have exited
    }
    const partial = job.assistantMessage.text.trim();
    job.assistantMessage = {
        ...job.assistantMessage,
        pending: false,
        at: Date.now(),
        text: partial || t("interrupted"),
    };
    await persistJob(job, true);
    jobs.delete(jobKey(channelId));
    emit(channelId);
}

export async function runLiveChat(opts: {
    channelId: string;
    title: string;
    provider: AiProvider;
    kind?: LiveJobKind;
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
        kind: opts.kind ?? "chat",
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
                emit(opts.channelId, false);
            } catch {
                // ignore poll errors
            }
        }, 400)
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
        notifyJobDone(job, reply.ok);
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
        notifyJobDone(job, false);
    } finally {
        if (poll) window.clearInterval(poll);
        if (!job.cancelled) jobs.delete(jobKey(opts.channelId));
        emit(opts.channelId);
    }

    return true;
}

async function persistJob(job: LiveJob, allowCancelled = false) {
    if (!job.channelId || (job.cancelled && !allowCancelled)) return;

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
