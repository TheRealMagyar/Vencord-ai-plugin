/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";
import { IS_WEB } from "@utils/constants";
import { PluginNative } from "@utils/types";
import { Message } from "@vencord/discord-types";

import type * as NativeApi from "./native";

export const cl = classNameFactory("vc-grokai-");

export type GrokNative = PluginNative<typeof NativeApi>;

export function getNative(): GrokNative | null {
    if (IS_WEB) return null;
    const helpers = VencordNative?.pluginHelpers as Record<string, GrokNative> | undefined;
    return helpers?.GrokAi ?? helpers?.grokAi ?? null;
}

export function getMessageContent(message: Message) {
    return message.content
        || message.messageSnapshots?.[0]?.message.content
        || message.embeds?.find(embed => embed.type === "auto_moderation_message")?.rawDescription
        || "";
}

export function t(hu: string, en: string, language: string) {
    if (language === "en") return en;
    if (language === "hu") return hu;
    return hu;
}
