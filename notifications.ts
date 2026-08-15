/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Channel } from "@vencord/discord-types";
import { ActiveJoinedThreadsStore, ChannelStore, FluxDispatcher, GuildChannelStore, GuildStore, MessageStore, ReadStateStore } from "@webpack/common";

import { getMessageContent } from "./utils";

export interface PingItem {
    channelId: string;
    guildId: string | null;
    guildName: string;
    channelName: string;
    mentionCount: number;
    preview: string;
    snippets?: string[];
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

function previewsFromStore(channelId: string, limit: number) {
    try {
        const bucket = MessageStore.getMessages(channelId) as { _array?: any[]; toArray?: () => any[]; };
        const arr = bucket?._array ?? bucket?.toArray?.() ?? [];
        const out: string[] = [];
        for (let i = arr.length - 1; i >= 0 && out.length < limit; i--) {
            const author = arr[i]?.author?.globalName || arr[i]?.author?.username || "";
            const text = getMessageContent(arr[i]).replace(/\s+/g, " ").trim();
            if (!text) continue;
            out.push(author ? `${author}: ${text.slice(0, 220)}` : text.slice(0, 220));
        }
        return out.reverse();
    } catch {
        return [];
    }
}

const DISCORD_EPOCH = 1420070400000n;
const CHANNEL_READ_STATE = 0;

function nowSnowflake() {
    return ((BigInt(Date.now()) - DISCORD_EPOCH) << 22n).toString();
}

function mentionChannelIds() {
    const ids = new Set<string>();
    try {
        const listed = ReadStateStore.getMentionChannelIds();
        if (Array.isArray(listed))
            for (const id of listed)
                if (typeof id === "string") ids.add(id);
    } catch {
        // ignore
    }
    try {
        for (const rs of ReadStateStore.getAllReadStates(true) ?? []) {
            if ((rs.type ?? CHANNEL_READ_STATE) !== CHANNEL_READ_STATE) continue;
            if ((rs._mentionCount || 0) <= 0 || !rs.channelId) continue;
            ids.add(rs.channelId);
        }
    } catch {
        // ignore
    }
    return [...ids];
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
            const snippets = previewsFromStore(channelId, 3);
            items.push({
                channelId,
                guildId,
                guildName: guild?.name || "",
                channelName: channelNameOf(channel),
                mentionCount,
                preview: snippets[snippets.length - 1] || "",
                snippets,
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

function resolveAckMessageId(channelId: string) {
    try {
        return ReadStateStore.lastMessageId(channelId)
            || ReadStateStore.getOldestUnreadMessageId(channelId)
            || ReadStateStore.ackMessageId(channelId)
            || ChannelStore.getChannel(channelId)?.lastMessageId
            || nowSnowflake();
    } catch {
        return nowSnowflake();
    }
}

function ackEntry(channelId: string) {
    if (!channelId) return null;
    return { channelId, messageId: resolveAckMessageId(channelId), readStateType: CHANNEL_READ_STATE };
}

function pushIfNeeded(
    into: { channelId: string; messageId: string; readStateType: number; }[],
    seen: Set<string>,
    channelId: string | undefined,
    force = false,
) {
    if (!channelId || seen.has(channelId)) return;
    if (!force) {
        let mentions = 0;
        let unread = false;
        try {
            mentions = ReadStateStore.getMentionCount(channelId) || 0;
            unread = ReadStateStore.hasUnread(channelId);
        } catch {
            return;
        }
        if (mentions <= 0 && !unread) return;
    }
    const row = ackEntry(channelId);
    if (!row) return;
    seen.add(channelId);
    into.push(row);
}

function pushGuildChannels(into: { channelId: string; messageId: string; readStateType: number; }[], seen: Set<string>) {
    for (const guild of Object.values(GuildStore.getGuilds())) {
        let groups: { SELECTABLE?: { channel: { id: string; }; }[]; VOCAL?: { channel: { id: string; }; }[]; } | undefined;
        try {
            groups = GuildChannelStore.getChannels(guild.id);
        } catch {
            continue;
        }
        const list = [...(groups?.SELECTABLE ?? []), ...(groups?.VOCAL ?? [])];
        try {
            const threads = Object.values(ActiveJoinedThreadsStore.getActiveJoinedThreadsForGuild(guild.id) ?? {});
            for (const bucket of threads)
                list.push(...Object.values(bucket as Record<string, { channel: { id: string; }; }>));
        } catch {
            // ignore
        }
        for (const entry of list)
            pushIfNeeded(into, seen, entry?.channel?.id);
    }
}

export function ackChannels(channelIds?: string[]) {
    try {
        const channels: { channelId: string; messageId: string; readStateType: number; }[] = [];
        const seen = new Set<string>();
        const targeted = Boolean(channelIds?.length);

        for (const channelId of targeted ? channelIds! : mentionChannelIds())
            pushIfNeeded(channels, seen, channelId, true);

        if (!targeted) {
            try {
                for (const rs of ReadStateStore.getAllReadStates(true) ?? []) {
                    if ((rs.type ?? CHANNEL_READ_STATE) !== CHANNEL_READ_STATE) continue;
                    if ((rs._mentionCount || 0) <= 0) continue;
                    pushIfNeeded(channels, seen, rs.channelId, true);
                }
            } catch {
                // ignore
            }
            pushGuildChannels(channels, seen);
            try {
                for (const channel of Object.values(ChannelStore.getMutablePrivateChannels() ?? {}))
                    pushIfNeeded(channels, seen, channel?.id);
            } catch {
                // ignore
            }
        }

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

export function formatPingsForAi(items: PingItem[], depth: "surface" | "medium" | "detailed" = "medium") {
    if (!items.length) return "";
    const snippetCount = depth === "detailed" ? 3 : depth === "medium" ? 2 : 1;
    return items.map((item, index) => {
        const where = item.isDm
            ? `Direct message with ${item.channelName}`
            : `${item.guildName} · ${item.channelName}`;
        const lines = item.snippets?.slice(-snippetCount) ?? (item.preview ? [item.preview] : []);
        return [
            `ITEM ${index + 1}`,
            `Where: ${where}`,
            `Mentions waiting: ${item.mentionCount}`,
            lines.length ? `Recent text:\n  ${lines.join("\n  ")}` : "Recent text: (not cached)",
            `Link: ${pingUrl(item)}`,
        ].join("\n");
    }).join("\n\n");
}
