/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Channel } from "@vencord/discord-types";
import { ChannelStore, FluxDispatcher, GuildStore, MessageStore, ReadStateStore } from "@webpack/common";

import { getMessageContent } from "./utils";

export interface PingItem {
    channelId: string;
    guildId: string | null;
    guildName: string;
    channelName: string;
    mentionCount: number;
    preview: string;
    lastMessageId: string | null;
    timestamp: number;
    isDm: boolean;
}

function channelNameOf(channel: Channel) {
    if (channel.name) return `#${channel.name}`;
    const recips = (channel as Channel & { rawRecipients?: { username?: string; globalName?: string; }[]; }).rawRecipients;
    if (recips?.length)
        return recips.map(user => user.globalName || user.username || "?").join(", ");
    return "DM";
}

function previewFromStore(channelId: string) {
    try {
        const bucket = MessageStore.getMessages(channelId) as { _array?: any[]; toArray?: () => any[]; };
        const arr = bucket?._array ?? bucket?.toArray?.() ?? [];
        for (let i = arr.length - 1; i >= 0; i--) {
            const text = getMessageContent(arr[i]);
            if (text) return text.replace(/\s+/g, " ").trim().slice(0, 180);
        }
    } catch {
        // ignore
    }
    return "";
}

function mentionChannelIds() {
    try {
        const ids = ReadStateStore.getMentionChannelIds();
        return Array.isArray(ids) ? ids.filter(id => typeof id === "string") : [];
    } catch {
        return [];
    }
}

export function collectPings(): PingItem[] {
    try {
        const items: PingItem[] = [];
        for (const channelId of mentionChannelIds()) {
            let mentionCount = 0;
            try {
                mentionCount = ReadStateStore.getMentionCount(channelId) || 0;
            } catch {
                continue;
            }
            if (mentionCount <= 0) continue;

            const channel = ChannelStore.getChannel(channelId);
            if (!channel) continue;

            const rawGuild = channel.guild_id || channel.getGuildId?.() || "";
            const guildId = rawGuild && rawGuild !== "@me" ? rawGuild : null;
            const guild = guildId ? GuildStore.getGuild(guildId) : null;
            let lastMessageId: string | null = null;
            let timestamp = Date.now();
            try {
                lastMessageId = ReadStateStore.lastMessageId(channelId);
                timestamp = ReadStateStore.lastMessageTimestamp(channelId) || Date.now();
            } catch {
                // ignore
            }
            items.push({
                channelId,
                guildId,
                guildName: guild?.name || "",
                channelName: channelNameOf(channel),
                mentionCount,
                preview: previewFromStore(channelId),
                lastMessageId,
                timestamp,
                isDm: !guildId,
            });
        }
        return items.sort((a, b) => b.timestamp - a.timestamp);
    } catch {
        return [];
    }
}

export function ackChannels(channelIds: string[]) {
    try {
        const channels = channelIds.map(channelId => ({
            channelId,
            messageId: ReadStateStore.lastMessageId(channelId),
            readStateType: 0,
        })).filter(entry => Boolean(entry.messageId));
        if (!channels.length) return;
        FluxDispatcher.dispatch({
            type: "BULK_ACK",
            context: "APP",
            channels,
        });
    } catch {
        // ignore
    }
}

export function pingUrl(item: PingItem) {
    const guild = item.guildId || "@me";
    const tail = item.lastMessageId ? `/${item.lastMessageId}` : "";
    return `https://discord.com/channels/${guild}/${item.channelId}${tail}`;
}

export function formatPingsForAi(items: PingItem[]) {
    if (!items.length) return "";
    return items.map((item, index) => {
        const where = item.isDm
            ? `Direct message with ${item.channelName}`
            : `${item.guildName} · ${item.channelName}`;
        return [
            `ITEM ${index + 1}`,
            `Where: ${where}`,
            `Mentions waiting: ${item.mentionCount}`,
            item.preview ? `Latest text: ${item.preview}` : "Latest text: (not cached)",
            `Link: ${pingUrl(item)}`,
        ].join("\n");
    }).join("\n\n");
}
