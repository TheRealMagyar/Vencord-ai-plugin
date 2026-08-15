/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Channel } from "@vencord/discord-types";
import { ChannelStore, FluxDispatcher, GuildChannelStore, GuildStore, MessageStore, ReadStateStore } from "@webpack/common";

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

function candidateChannelIds() {
    const ids = new Set<string>();
    try {
        for (const id of ReadStateStore.getMentionChannelIds() ?? [])
            ids.add(id);
    } catch {
        // ignore
    }
    try {
        for (const guild of Object.values(GuildStore.getGuilds())) {
            const groups = GuildChannelStore.getChannels(guild.id);
            for (const group of [groups?.SELECTABLE, groups?.VOCAL].filter(Boolean)) {
                for (const entry of group as { channel: { id: string; }; }[])
                    ids.add(entry.channel.id);
            }
        }
    } catch {
        // ignore
    }
    try {
        for (const channel of Object.values(ChannelStore.getMutablePrivateChannels()))
            ids.add(channel.id);
    } catch {
        // ignore
    }
    return [...ids];
}

export function collectPings(): PingItem[] {
    const items: PingItem[] = [];
    for (const channelId of candidateChannelIds()) {
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
        const lastMessageId = ReadStateStore.lastMessageId(channelId);
        items.push({
            channelId,
            guildId,
            guildName: guild?.name || "",
            channelName: channelNameOf(channel),
            mentionCount,
            preview: previewFromStore(channelId),
            lastMessageId,
            timestamp: ReadStateStore.lastMessageTimestamp(channelId) || Date.now(),
            isDm: !guildId,
        });
    }
    return items.sort((a, b) => b.timestamp - a.timestamp);
}

export function totalMentionCount(items = collectPings()) {
    return items.reduce((sum, item) => sum + item.mentionCount, 0);
}

export function ackChannels(channelIds: string[]) {
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
}

export function formatPingsForAi(items: PingItem[]) {
    if (!items.length) return "";
    return items.map(item => {
        const where = item.isDm
            ? `DM · ${item.channelName}`
            : `${item.guildName} · ${item.channelName}`;
        const preview = item.preview ? `\n  ${item.preview}` : "";
        return `[${where}] ${item.mentionCount} mention(s)${preview}`;
    }).join("\n");
}
