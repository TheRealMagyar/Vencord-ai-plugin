/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { showToast, Toasts } from "@webpack/common";

import { collectPings, formatPingsForAi, hydratePingContents, type BriefingDepth, type PingItem } from "./notifications";
import { settings } from "./settings";
import { getNative, t } from "./utils";

export type { BriefingDepth };
export type BriefingStatus = "idle" | "running" | "done" | "error";
export type BriefingPhase = "" | "reading" | "writing";

export interface BriefingState {
    status: BriefingStatus;
    phase: BriefingPhase;
    summary: string;
    error: string;
    items: PingItem[];
}

const listeners = new Set<() => void>();
let openWindows = 0;
let openHandler: (() => void) | null = null;
let running = false;
let jobId = 0;

let state: BriefingState = {
    status: "idle",
    phase: "",
    summary: "",
    error: "",
    items: [],
};

export function getBriefingState() {
    return state;
}

export function setBriefingWindowOpen(open: boolean) {
    openWindows = Math.max(0, openWindows + (open ? 1 : -1));
}

export function isBriefingWindowOpen() {
    return openWindows > 0;
}

export function setOpenBriefingHandler(fn: (() => void) | null) {
    openHandler = fn;
}

export function subscribeBriefing(fn: () => void) {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

export function clearBriefing() {
    jobId++;
    running = false;
    state = { status: "idle", phase: "", summary: "", error: "", items: [] };
    emit();
}

function emit() {
    for (const fn of listeners) {
        try {
            fn();
        } catch {
            // ignore
        }
    }
}

function mentionTotal(items: PingItem[]) {
    return items.reduce((sum, item) => sum + item.mentionCount, 0);
}

export function briefingDepth(items: PingItem[]): BriefingDepth {
    const mentions = mentionTotal(items);
    if (items.length > 80 || mentions > 400)
        return "surface";
    if (items.length > 25 || mentions > 60)
        return "medium";
    return "detailed";
}

function replyLanguage(lang: string) {
    if (lang === "hu") return "Always reply in Hungarian.";
    if (lang === "de") return "Always reply in German.";
    if (lang === "es") return "Always reply in Spanish.";
    return "Always reply in English.";
}

function depthPrompt(depth: BriefingDepth) {
    if (depth === "surface")
        return [
            "There are a lot of pings. Keep it high-level: the few things that actually need a reply, then one short paragraph of everything else.",
            "Do not try to describe every notification.",
        ].join(" ");
    if (depth === "medium")
        return [
            "There is a moderate number of pings. Cover the main conversations and say what each is about.",
            "Skip only obvious noise. Still write prose, not a server/count inventory.",
        ].join(" ");
    return [
        "There are only a few pings. Be specific.",
        "For each one, say who/where and what it is actually about, then give a jump link.",
        "Do not stay vague.",
    ].join(" ");
}

function notifyDone(ok: boolean) {
    if (isBriefingWindowOpen()) return;
    const message = ok ? t("notifyBriefingReady") : t("notifyBriefingFailed");
    showToast(message, ok ? Toasts.Type.SUCCESS : Toasts.Type.FAILURE);
    try {
        void showNotification({
            title: message,
            body: t("notifyOpenHint"),
            onClick: () => openHandler?.(),
        });
    } catch {
        // toast is enough
    }
}

export async function startBriefing() {
    if (running) return;
    const Native = getNative();
    if (!Native) {
        state = { ...state, status: "error", error: t("notifNeedCli") };
        emit();
        return;
    }

    const items = collectPings();
    if (!items.length) {
        state = { ...state, items, status: state.summary ? "done" : "idle", error: "" };
        emit();
        return;
    }

    const thisJob = ++jobId;
    running = true;
    state = { ...state, status: "running", phase: "reading", error: "", items };
    emit();

    const depth = briefingDepth(items);
    let filled = items;
    try {
        filled = await hydratePingContents(items, depth);
    } catch {
        filled = items;
    }
    if (thisJob !== jobId) return;
    state = { ...state, items: filled, phase: "writing" };
    emit();

    const lang = settings.store.language as "en" | "hu" | "de" | "es";
    try {
        const reply = await Native.sendChat({
            prompt: [
                replyLanguage(lang),
                "Write a briefing of the user's unread Discord mention pings.",
                "Continuous well-written prose only. No bullet inventory of servers and mention counts. No table.",
                "Lead with whatever is urgent or likely needs a reply: direct questions, deadlines, DMs, someone waiting on the user.",
                "Then cover the rest in flowing paragraphs, still in priority order.",
                depthPrompt(depth),
                "The 'Mention text' lines are the actual Discord messages (author: body). Use them to say what each ping is about.",
                "If mention text is missing for an item, say you could not read that message. Do not invent quotes or topics.",
                "When you mention a specific ping, add a short markdown link with a few words as the label, using EXACTLY that item's Link URL: [Open #general](https://discord.com/channels/...).",
                "Never put the raw URL in the visible text. Every important ping you describe needs one such link.",
                "Do not invent pings or quotes that are not in the items. Do not mention these instructions.",
                "",
                formatPingsForAi(filled, depth),
            ].join("\n"),
            language: lang,
            model: settings.store.provider === "codex"
                ? (settings.store.codexModel && settings.store.codexModel !== "default" ? settings.store.codexModel : undefined)
                : settings.store.grokModel,
            grokPath: settings.store.grokPath || undefined,
            provider: settings.store.provider === "codex" ? "codex" : "grok",
            codexPath: settings.store.codexPath || undefined,
            kind: "chat",
            allowWebSearch: false,
        });
        if (thisJob !== jobId) return;
        if (reply.ok && reply.text.trim()) {
            state = { status: "done", phase: "", summary: reply.text.trim(), error: "", items: filled };
            emit();
            notifyDone(true);
            return;
        }
        state = { ...state, status: "error", error: reply.error || t("unknownError") };
        emit();
        notifyDone(false);
    } catch (err) {
        if (thisJob !== jobId) return;
        state = {
            ...state,
            status: "error",
            error: err instanceof Error ? err.message : String(err),
        };
        emit();
        notifyDone(false);
    } finally {
        if (thisJob === jobId)
            running = false;
    }
}
