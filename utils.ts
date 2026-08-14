/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { PluginNative } from "@utils/types";
import { Message } from "@vencord/discord-types";

export const cl = classNameFactory("vc-grokai-");

export type GrokNative = PluginNative<typeof import("./native")>;

export function getNative(): GrokNative | null {
    try {
        if (typeof IS_WEB !== "undefined" && IS_WEB) return null;
        const helpers = VencordNative?.pluginHelpers as Record<string, GrokNative> | undefined;
        return helpers?.["AI-Plugin"] ?? helpers?.AiPlugin ?? helpers?.GrokAi ?? helpers?.grokAi ?? helpers?.AIPlugin ?? null;
    } catch {
        return null;
    }
}

export function getMessageContent(message: Message) {
    return message.content
        || message.messageSnapshots?.[0]?.message.content
        || message.embeds?.find(embed => embed.type === "auto_moderation_message")?.rawDescription
        || "";
}

export { t } from "./i18n";
