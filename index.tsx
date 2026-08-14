/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Message } from "@vencord/discord-types";
import { ChannelStore, Menu, showToast, Toasts, useEffect, useState } from "@webpack/common";

import { openGrokModal } from "./ChatModal";
import { GrokIcon } from "./GrokIcon";
import { settings } from "./settings";
import type { GrokStatus, UpdateStatus } from "./types";
import { cl, getMessageContent, getNative, t } from "./utils";

const GrokChatBarButton: ChatBarButtonFactory = ({ isMainChat, isAnyChat, channel }) => {
    if (isMainChat === false && isAnyChat === false) return null;

    return (
        <ChatBarButton
            tooltip="Grok"
            onClick={() => openGrokModal({ channelId: channel?.id })}
            buttonProps={{ "aria-haspopup": "dialog" }}
        >
            <GrokIcon className={cl("icon", "chat-button")} />
        </ChatBarButton>
    );
};

const messageCtxPatch: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    if (!getMessageContent(message)) return;

    const group = findGroupChildrenByChildId("copy-text", children);
    if (!group) return;

    group.splice(group.findIndex(c => c?.props?.id === "copy-text") + 1, 0, (
        <Menu.MenuItem
            id="vc-grokai-explain"
            label={t("Magyarázat Grokkal", "Explain with Grok", settings.store.language)}
            icon={GrokIcon}
            action={() => openGrokModal({ explainMessage: message, channelId: message.channel_id })}
        />
    ));
};

async function runPluginUpdate(language: string) {
    const Native = getNative();
    if (!Native) {
        showToast(t("Csak asztali Discordon megy a frissítés.", "Updates only work on desktop Discord.", language), Toasts.Type.FAILURE);
        return;
    }

    showToast(t("GrokAi frissítés…", "Updating GrokAi…", language), Toasts.Type.MESSAGE);
    const result = await Native.applyUpdate();
    if (result.ok) {
        showToast(
            t("GrokAi frissítve. Indítsd újra a Discordot.", "GrokAi updated. Restart Discord.", language),
            Toasts.Type.SUCCESS,
        );
        return;
    }
    showToast(result.error || t("Frissítés sikertelen.", "Update failed.", language), Toasts.Type.FAILURE);
}

function SettingsAbout() {
    const { language, grokPath } = settings.use(["language", "grokPath"]);
    const [status, setStatus] = useState<GrokStatus | null>(null);
    const [update, setUpdate] = useState<UpdateStatus | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        const Native = getNative();
        if (!Native) {
            setStatus({
                installed: false,
                authenticated: false,
                grokPath: null,
                version: null,
                displayName: null,
                subscription: null,
                authMode: null,
                expiresAt: null,
                error: "Desktop Discord / Vesktop required.",
            });
            return;
        }
        Native.getStatus(grokPath || undefined).then(setStatus).catch(error => {
            setStatus({
                installed: false,
                authenticated: false,
                grokPath: null,
                version: null,
                displayName: null,
                subscription: null,
                authMode: null,
                expiresAt: null,
                error: error instanceof Error ? error.message : String(error),
            });
        });
        Native.checkForUpdate().then(setUpdate).catch(() => { /* ignore */ });
    }, [grokPath]);

    return (
        <div className={cl("settings")}>
            <strong>{status?.authenticated
                ? t("Grok CLI csatlakoztatva", "Grok CLI connected", language)
                : t("Grok CLI státusz", "Grok CLI status", language)}</strong>
            <div>{status?.subscription || status?.error || t("Ellenőrzés…", "Checking…", language)}</div>
            {status?.displayName && <div>{t("Fiók", "Account", language)}: {status.displayName}</div>}
            {status?.version && <div>CLI: {status.version}</div>}
            {status?.grokPath && <div><code>{status.grokPath}</code></div>}

            <strong>{t("GitHub frissítés", "GitHub update", language)}</strong>
            <div>
                {update == null
                    ? t("Ellenőrzés…", "Checking…", language)
                    : update.available
                        ? t(`Új verzió van (${update.local} → ${update.remote})`, `Update available (${update.local} → ${update.remote})`, language)
                        : update.ok
                            ? t("Naprakész.", "Up to date.", language)
                            : (update.error || t("Nem sikerült ellenőrizni.", "Could not check.", language))}
            </div>
            <button
                className={cl("send")}
                disabled={busy}
                onClick={async () => {
                    setBusy(true);
                    try {
                        await runPluginUpdate(language);
                        const Native = getNative();
                        if (Native) setUpdate(await Native.checkForUpdate());
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                {busy
                    ? t("Frissítés…", "Updating…", language)
                    : t("Frissítés most", "Update now", language)}
            </button>
        </div>
    );
}

export default definePlugin({
    name: "GrokAi",
    description: "Chat bar and message-action Grok button that uses your local Grok CLI subscription.",
    authors: [{ name: "TheRealMagyar", id: 0n }],
    searchTerms: ["Grok", "xAI", "AI", "ChatGPT", "explain"],
    tags: ["Chat", "Utility"],
    dependencies: ["ChatInputButtonAPI", "MessagePopoverAPI", "CommandsAPI"],
    settings,
    settingsAboutComponent: SettingsAbout,
    requiresRestart: true,

    async start() {
        if (!settings.store.autoUpdate) return;
        const Native = getNative();
        if (!Native) return;
        try {
            const check = await Native.checkForUpdate();
            if (!check.ok || !check.available) return;
            await runPluginUpdate(settings.store.language);
        } catch {
            // ignore startup update errors
        }
    },

    toolboxActions: {
        "GrokAi frissítése": () => runPluginUpdate(settings.store.language),
    },

    contextMenus: {
        message: messageCtxPatch,
    },

    chatBarButton: {
        icon: GrokIcon,
        render: GrokChatBarButton,
    },

    messagePopoverButton: {
        icon: GrokIcon,
        render(message: Message) {
            const content = getMessageContent(message);
            if (!content) return null;

            return {
                label: t("Magyarázat Grokkal", "Explain with Grok", settings.store.language),
                icon: GrokIcon,
                message,
                channel: ChannelStore.getChannel(message.channel_id),
                onClick: () => openGrokModal({ explainMessage: message, channelId: message.channel_id }),
            };
        },
    },

    commands: [
        {
            name: "grok",
            description: "Ask Grok or open the Grok chat",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "question",
                    description: "Question for Grok",
                    type: ApplicationCommandOptionType.STRING,
                    required: false,
                },
            ],
            execute: async (args, ctx) => {
                const question = findOption<string>(args, "question");
                if (!question) {
                    openGrokModal();
                    return;
                }

                const Native = getNative();
                if (!Native) {
                    return sendBotMessage(ctx.channel.id, {
                        content: "GrokAi only works on desktop Discord / Vesktop.",
                    });
                }

                sendBotMessage(ctx.channel.id, { content: "Grok gondolkodik…" });
                const reply = await Native.sendChat({
                    prompt: question,
                    model: settings.store.model,
                    language: settings.store.language as "auto" | "hu" | "en",
                    allowWebSearch: settings.store.allowWebSearch,
                    grokPath: settings.store.grokPath || undefined,
                });

                const text = reply.ok ? reply.text : (reply.error || "Grok error");
                return sendBotMessage(ctx.channel.id, {
                    content: text.length > 1900 ? `${text.slice(0, 1900)}…` : text,
                });
            },
        },
        {
            name: "grokupdate",
            description: "Pull the latest GrokAi plugin from GitHub and rebuild",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: async () => {
                await runPluginUpdate(settings.store.language);
            },
        },
    ],
});
