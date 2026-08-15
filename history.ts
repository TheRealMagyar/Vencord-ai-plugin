/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { ChannelStore, UserStore } from "@webpack/common";

import type { ChatMessage, StoredThread } from "./types";
import { t } from "./i18n";

const KEY = "GrokAi.history.v1";
const MAX_MESSAGES = 100;

interface HistoryFile {
    threads: Record<string, StoredThread>;
}

let cached: HistoryFile | null = null;
let writeChain: Promise<void> = Promise.resolve();

function enqueueWrite(work: () => Promise<void>) {
    const next = writeChain.then(work, work);
    writeChain = next.then(() => undefined, () => undefined);
    return next;
}

async function readFile(): Promise<HistoryFile> {
    if (cached) return cached;
    const data = await DataStore.get<HistoryFile>(KEY);
    cached = data?.threads && typeof data.threads === "object" ? data : { threads: {} };
    return cached;
}

export function getThreadTitle(channelId: string | null | undefined) {
    if (!channelId) return "Grok";
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return "Grok";

    try {
        if (channel.isDM?.()) {
            const userId = channel.getRecipientId?.() || channel.recipients?.[0];
            const user = userId ? UserStore.getUser(userId) : null;
            return user ? `@${user.username}` : "DM";
        }
        if (channel.isGroupDM?.()) {
            return channel.name ? channel.name : t("groupDm");
        }
    } catch {
        // fall through
    }

    if (channel.name) return `#${channel.name}`;
    return "Grok";
}

export async function loadThread(channelId: string): Promise<StoredThread | null> {
    const file = await readFile();
    return file.threads[channelId] ?? null;
}

export async function saveThread(thread: StoredThread) {
    return enqueueWrite(async () => {
        const file = await readFile();
        file.threads[thread.channelId] = {
            ...thread,
            messages: thread.messages.filter(msg => !msg.pending).slice(-MAX_MESSAGES),
            updatedAt: Date.now(),
        };
        cached = file;
        await DataStore.set(KEY, file);
    });
}

export async function clearThread(channelId: string) {
    return enqueueWrite(async () => {
        const file = await readFile();
        delete file.threads[channelId];
        cached = file;
        await DataStore.set(KEY, file);
    });
}

export async function listThreads(): Promise<StoredThread[]> {
    const file = await readFile();
    return Object.values(file.threads)
        .filter(thread => thread.messages?.length)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function persistableMessages(messages: ChatMessage[]) {
    return messages
        .filter(msg => !msg.pending)
        .map(({ pending: _pending, ...msg }) => ({
            ...msg,
            thought: msg.thought && msg.thought.length > 6000
                ? msg.thought.slice(-6000)
                : msg.thought,
        }));
}
