/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Channel } from "@vencord/discord-types";
import { ActiveJoinedThreadsStore, ChannelStore, FluxDispatcher, GuildChannelStore, GuildStore, MessageStore, ReadStateStore, RestAPI, UserStore } from "@webpack/common";

export interface PingItem {
    channelId: string;
    guildId: string | null;
    guildName: string;
    channelName: string;
    mentionCount: number;
    preview: string;
    snippets?: string[];
    lastMessageId: string | null;
    mentionMessageId?: string | null;
    gotMentionText?: boolean;
    timestamp: number;
    isDm: boolean;
}

export type BriefingDepth = "surface" | "medium" | "detailed";

function channelNameOf(channel: Channel) {
    if (channel.name) return `#${channel.name}`;
    const recips = (channel as Channel & { rawRecipients?: { username?: string; globalName?: string; }[]; }).rawRecipients;
    if (recips?.length)
        return recips.map(user => user.globalName || user.username || "?").join(", ");
    return "DM";
}

function currentUserId() {
    try {
        return UserStore.getCurrentUser()?.id || "";
    } catch {
        return "";
    }
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
        if (embed?.type === "auto_moderation_message" && embed?.rawDescription)
            parts.push(String(embed.rawDescription));
    }
    if (raw?.stickerItems?.length || raw?.stickers?.length) parts.push("[sticker]");
    return parts.join(" ").replace(/\s+/g, " ").trim();
}

function formatMsg(raw: any) {
    const text = messageBody(raw);
    if (!text) return "";
    const author = raw?.author?.globalName || raw?.author?.username || raw?.author?.name || "";
    return author ? `${author}: ${text.slice(0, 280)}` : text.slice(0, 280);
}

function isMentionOfMe(raw: any, me: string) {
    if (!me) return true;
    if (raw?.mention_everyone || raw?.mentionEveryone) return true;
    const mentions = raw?.mentions;
    if (Array.isArray(mentions) && mentions.some((user: any) => (user?.id || user) === me))
        return true;
    const content = typeof raw?.content === "string" ? raw.content : "";
    if (content.includes(`<@${me}>`) || content.includes(`<@!${me}>`))
        return true;
    const roles = raw?.mention_roles ?? raw?.mentionRoles;
    return Array.isArray(roles) && roles.length > 0;
}

function storeMessages(channelId: string) {
    try {
        const bucket = MessageStore.getMessages(channelId) as { _array?: any[]; toArray?: () => any[]; };
        return bucket?._array ?? bucket?.toArray?.() ?? [];
    } catch {
        return [];
    }
}

function previewsFromStore(channelId: string, limit: number) {
    const me = currentUserId();
    const arr = storeMessages(channelId);
    const mine: string[] = [];
    const any: string[] = [];
    for (let i = arr.length - 1; i >= 0 && (mine.length < limit || any.length < limit); i--) {
        const line = formatMsg(arr[i]);
        if (!line) continue;
        if (any.length < limit) any.push(line);
        if (mine.length < limit && isMentionOfMe(arr[i], me)) mine.push(line);
    }
    const mentionLines = mine.reverse();
    return {
        snippets: (mentionLines.length ? mentionLines : any.reverse()),
        gotMentionText: mentionLines.length > 0,
    };
}

function applyMessages(item: PingItem, raws: any[], fromInbox = false) {
    const me = currentUserId();
    const mine = fromInbox ? raws : raws.filter(raw => isMentionOfMe(raw, me));
    const use = mine.length ? mine : raws;
    const lines = use.map(formatMsg).filter(Boolean).slice(-8);
    if (!lines.length) return item;
    const last = use[use.length - 1];
    item.snippets = lines;
    item.preview = lines[lines.length - 1];
    item.gotMentionText = fromInbox || mine.length > 0;
    if (last?.id) item.mentionMessageId = String(last.id);
    return item;
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
            const cached = previewsFromStore(channelId, 4);
            items.push({
                channelId,
                guildId,
                guildName: guild?.name || "",
                channelName: channelNameOf(channel),
                mentionCount,
                preview: cached.snippets[cached.snippets.length - 1] || "",
                snippets: cached.snippets,
                lastMessageId,
                mentionMessageId: lastMessageId,
                gotMentionText: cached.gotMentionText,
                timestamp,
                isDm: !guildId,
            });
        }
        return items.sort((a, b) => b.timestamp - a.timestamp);
    } catch {
        return [];
    }
}

async function restGet(url: string, query: Record<string, string | number | boolean>) {
    const res = await RestAPI.get({ url, query, retries: 1 });
    const body = res?.body;
    return Array.isArray(body) ? body : [];
}

async function fetchMentionInbox(limit: number) {
    const out: any[] = [];
    const seen = new Set<string>();
    let before: string | undefined;
    for (let page = 0; page < 4 && out.length < limit; page++) {
        const query: Record<string, string | number | boolean> = {
            limit: Math.min(50, limit - out.length),
            roles: true,
            everyone: true,
        };
        if (before) query.before = before;
        const batch = await restGet("/users/@me/mentions", query);
        if (!batch.length) break;
        let added = 0;
        for (const msg of batch) {
            const id = msg?.id ? String(msg.id) : "";
            if (!id || seen.has(id)) continue;
            seen.add(id);
            out.push(msg);
            added++;
        }
        const last = batch[batch.length - 1];
        const next = last?.id ? String(last.id) : "";
        if (!added || !next || next === before) break;
        before = next;
        if (batch.length < 10) break;
    }
    return out;
}

async function fetchChannelMentionMessages(item: PingItem, limit: number) {
    const query: Record<string, string | number | boolean> = { limit: Math.min(50, Math.max(limit, 20)) };
    if (item.lastMessageId) query.around = item.lastMessageId;
    return restGet(`/channels/${item.channelId}/messages`, query);
}

async function mapPool<T>(items: T[], workers: number, fn: (item: T) => Promise<void>) {
    let index = 0;
    async function worker() {
        while (index < items.length) {
            const current = items[index++];
            try {
                await fn(current);
            } catch {
                // one channel failing must not stop the rest
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(workers, items.length) || 0 }, worker));
}

export async function hydratePingContents(items: PingItem[], depth: BriefingDepth = "medium") {
    if (!items.length) return items;
    const copies = items.map(item => ({
        ...item,
        snippets: item.snippets ? [...item.snippets] : [],
    }));
    const byChannel = new Map(copies.map(item => [item.channelId, item]));

    const inboxLimit = depth === "surface" ? 50 : depth === "medium" ? 80 : 120;
    try {
        for (const msg of await fetchMentionInbox(inboxLimit)) {
            const channelId = msg?.channel_id || msg?.channelId;
            const item = channelId ? byChannel.get(String(channelId)) : undefined;
            if (!item) continue;
            const line = formatMsg(msg);
            if (!line) continue;
            const snippets = item.snippets ?? [];
            if (!snippets.includes(line)) snippets.push(line);
            item.snippets = snippets.slice(-8);
            item.preview = line;
            item.gotMentionText = true;
            if (msg.id) item.mentionMessageId = String(msg.id);
        }
    } catch {
        // channel fetches below still run
    }

    const missing = copies.filter(item => !item.gotMentionText);
    const maxFetch = depth === "surface" ? 12 : depth === "medium" ? 36 : 56;
    const perChannel = depth === "detailed" ? 20 : depth === "medium" ? 12 : 8;
    await mapPool(missing.slice(0, maxFetch), 3, async item => {
        const raws = await fetchChannelMentionMessages(item, perChannel);
        applyMessages(item, raws);
    });

    return copies;
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
    const messageId = item.mentionMessageId || item.lastMessageId;
    const tail = messageId ? `/${messageId}` : "";
    return `https://discord.com/channels/${guild}/${item.channelId}${tail}`;
}

function hasText(item: PingItem) {
    return Boolean(item.preview || item.snippets?.length);
}

export function formatPingsForAi(items: PingItem[], depth: BriefingDepth = "medium") {
    if (!items.length) return "";
    const snippetCount = depth === "detailed" ? 5 : depth === "medium" ? 3 : 2;
    const cap = depth === "surface" ? 24 : depth === "medium" ? 48 : 80;
    const ranked = [...items].sort((a, b) => {
        const textDiff = Number(hasText(b)) - Number(hasText(a));
        if (textDiff) return textDiff;
        return b.timestamp - a.timestamp;
    });
    const focus = ranked.slice(0, cap);
    const rest = items.filter(item => !focus.includes(item));

    const blocks = focus.map((item, index) => {
        const where = item.isDm
            ? `Direct message with ${item.channelName}`
            : `${item.guildName} · ${item.channelName}`;
        const lines = item.snippets?.slice(-snippetCount) ?? (item.preview ? [item.preview] : []);
        return [
            `ITEM ${index + 1}`,
            `Where: ${where}`,
            `Mentions waiting: ${item.mentionCount}`,
            lines.length
                ? `Mention text:\n  ${lines.join("\n  ")}`
                : "Mention text: (Discord did not return the message body)",
            `Link: ${pingUrl(item)}`,
        ].join("\n");
    });

    if (rest.length) {
        const mentions = rest.reduce((sum, item) => sum + item.mentionCount, 0);
        const places = new Set(rest.map(item => item.guildName || "DM")).size;
        blocks.push(`OTHER: ${rest.length} more channels / ${mentions} mentions across ${places} places. Message bodies were not fetched for these.`);
    }

    return blocks.join("\n\n");
}
