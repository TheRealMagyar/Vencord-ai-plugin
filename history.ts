/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { ChannelStore, UserStore } from "@webpack/common";

import type { ChatMessage, StoredThread } from "./types";

const KEY = "GrokAi.history.v1";
const MAX_MESSAGES = 100;

interface HistoryFile {
    threads: Record<string, StoredThread>;
}

async function readFile(): Promise<HistoryFile> {
    const data = await DataStore.get<HistoryFile>(KEY);
    if (data?.threads && typeof data.threads === "object") return data;
    return { threads: {} };
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
            return channel.name ? channel.name : "Csoport";
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
    const file = await readFile();
    file.threads[thread.channelId] = {
        ...thread,
        messages: thread.messages.filter(msg => !msg.pending).slice(-MAX_MESSAGES),
        updatedAt: Date.now(),
    };
    await DataStore.set(KEY, file);
}

export async function clearThread(channelId: string) {
    const file = await readFile();
    delete file.threads[channelId];
    await DataStore.set(KEY, file);
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
