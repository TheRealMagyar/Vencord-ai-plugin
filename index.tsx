/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { migratePluginSetting, migratePluginSettings } from "@api/Settings";
import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import { Message } from "@vencord/discord-types";
import { ChannelStore, Menu, showToast, Toasts, useEffect, useState } from "@webpack/common";

import { packChannelContext, withTranscript } from "./channelContext";
import { openGrokModal } from "./ChatModal";
import { GrokIcon } from "./GrokIcon";
import { settings } from "./settings";
import type { GrokStatus, UpdateStatus } from "./types";
import { cl, getMessageContent, getNative, t } from "./utils";

migratePluginSettings("AI-Plugin", "GrokAi");
migratePluginSetting("AI-Plugin", "grokModel", "model");

const GrokChatBarButton: ChatBarButtonFactory = ({ isMainChat, isAnyChat, channel }) => {
    settings.use(["iconSvg", "iconPreset"]);
    if (isMainChat === false && isAnyChat === false) return null;

    return (
        <ChatBarButton
            tooltip="AI"
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
            label={t("explainWithAi")}
            icon={GrokIcon}
            action={() => openGrokModal({ explainMessage: message, channelId: message.channel_id })}
        />
    ));
};

async function runPluginUpdate(language: string) {
    const Native = getNative();
    if (!Native) {
        showToast(t("updateDesktopOnly"), Toasts.Type.FAILURE);
        return;
    }

    showToast(t("updating"), Toasts.Type.MESSAGE);
    const result = await Native.applyUpdate();
    if (result.ok) {
        showToast(
            t("updatedRestart"),
            Toasts.Type.SUCCESS,
        );
        return;
    }
    showToast(result.error || t("updateFailed"), Toasts.Type.FAILURE);
}

function SettingsAbout() {
    const { language, grokPath, provider, codexPath } = settings.use(["language", "grokPath", "provider", "codexPath"]);
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
        Native.getStatus(provider === "codex" ? "codex" : "grok", ((provider === "codex" ? codexPath : grokPath) || undefined)).then(setStatus).catch(error => {
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
    }, [grokPath, provider, codexPath]);

    return (
        <div className={cl("settings")}>
            <strong>{status?.authenticated
                ? t("cliConnected", { name: provider === "codex" ? "Codex" : "Grok" })
                : t("cliStatus")}</strong>
            <div>{status?.subscription || status?.error || t("checking")}</div>
            {status?.displayName && <div>{t("account")}: {status.displayName}</div>}
            {status?.version && <div>CLI: {status.version}</div>}
            {status?.grokPath && <div><code>{status.grokPath}</code></div>}

            <strong>{t("githubUpdate")}</strong>
            <div>
                {update == null
                    ? t("checking")
                    : update.available
                        ? t("updateAvailable", { local: update.local ?? "", remote: update.remote ?? "" })
                        : update.ok
                            ? t("upToDate")
                            : (update.error || t("checkFailed"))}
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
                    ? t("updateInProgress")
                    : t("updateNow")}
            </button>
        </div>
    );
}

export default definePlugin({
    name: "AI-Plugin",
    description: "Chat bar AI button using your local Grok or Codex CLI subscription.",
    authors: [{ name: "TheRealMagyar", id: 0n }],
    searchTerms: ["GrokAi", "Grok", "xAI", "AI", "ChatGPT", "Codex", "OpenAI", "explain"],
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
        "Update AI-Plugin": () => runPluginUpdate(settings.store.language),
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
                label: t("explainWithAi"),
                icon: GrokIcon,
                message,
                channel: ChannelStore.getChannel(message.channel_id),
                onClick: () => openGrokModal({ explainMessage: message, channelId: message.channel_id }),
            };
        },
    },

    commands: [
        {
            name: "ai",
            description: "Ask the AI or open the AI chat",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "question",
                    description: "Question for the AI",
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
                        content: "AI-Plugin only works on desktop Discord / Vesktop.",
                    });
                }

                sendBotMessage(ctx.channel.id, { content: t("thinkingShort") });
                const packed = await packChannelContext({
                    channelId: ctx.channel.id,
                    prompt: question,
                    enabled: settings.store.includeChannelContext,
                });
                const reply = await Native.sendChat({
                    prompt: withTranscript(question, packed, "chat"),
                    model: settings.store.provider === "codex"
                        ? (settings.store.codexModel && settings.store.codexModel !== "default" ? settings.store.codexModel : undefined)
                        : settings.store.grokModel,
                    language: settings.store.language as "en" | "hu" | "de" | "es",
                    allowWebSearch: settings.store.allowWebSearch,
                    grokPath: settings.store.grokPath || undefined,
                    provider: settings.store.provider === "codex" ? "codex" : "grok",
                    codexPath: settings.store.codexPath || undefined,
                });

                const text = reply.ok ? reply.text : (reply.error || "AI error");
                return sendBotMessage(ctx.channel.id, {
                    content: text.length > 1900 ? `${text.slice(0, 1900)}…` : text,
                });
            },
        },
        {
            name: "aiupdate",
            description: "Pull the latest AI-Plugin from GitHub and rebuild",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: async () => {
                await runPluginUpdate(settings.store.language);
            },
        },
    ],
});
