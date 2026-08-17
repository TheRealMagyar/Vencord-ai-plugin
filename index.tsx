/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { HeaderBarButton } from "@api/HeaderBar";
import { addMessagePopoverButton, removeMessagePopoverButton } from "@api/MessagePopover";
import { addServerListElement, removeServerListElement, ServerListRenderPosition } from "@api/ServerList";
import { migratePluginSetting, migratePluginSettings } from "@api/Settings";
import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import { Channel, Message } from "@vencord/discord-types";
import { ChannelStore, Menu, SelectedChannelStore, showToast, Toasts, useEffect, useState } from "@webpack/common";

import { packChannelContext, withTranscript } from "./channelContext";
import { getCachedStatus, refreshCliStatus, startCliStatusWatch, stopCliStatusWatch, subscribeCliStatus } from "./cliStatus";
import { openGrokModal } from "./ChatModal";
import { loadThread } from "./history";
import { chatProviderFields, currentProvider, historyForRequest, providerLabel, resolveProvider } from "./provider";
import { DraftReplyIcon, FactCheckIcon, GrokIcon, SummarizeIcon } from "./GrokIcon";
import type { SummarizeRange } from "./types";
import { renderNotificationCenterButton } from "./ServerListButton";
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

function ToolbarGrokIcon({ width, height, size, className }: { width?: number; height?: number; size?: number | string; className?: string; }) {
    const dim = typeof size === "number" ? size : (width ?? height ?? 20);
    return <GrokIcon width={dim} height={dim} className={className} />;
}

const ChannelHeaderAiButton = ErrorBoundary.wrap(function ChannelHeaderAiButton() {
    settings.use(["iconSvg", "iconPreset"]);
    return (
        <HeaderBarButton
            icon={ToolbarGrokIcon}
            tooltip="AI"
            iconSize={20}
            onClick={() => openGrokModal({ channelId: SelectedChannelStore.getChannelId() || undefined })}
        />
    );
}, { noop: true });

function channelIdFromMenu(props: { channel?: Channel; channelId?: string; user?: { id: string; }; }) {
    if (props.channel?.id) return props.channel.id;
    if (props.channelId) return props.channelId;
    return "";
}

function dmIdFromUser(props: { user?: { id: string; }; channel?: Channel; }) {
    try {
        if (props.user?.id)
            return ChannelStore.getDMFromUserId(props.user.id) || "";
    } catch {
        // ignore
    }
    if (props.channel?.isDM?.()) return props.channel.id;
    return "";
}

const userCtxPatch: NavContextMenuPatchCallback = (children, props: { user?: { id: string; }; channel?: Channel; }) => {
    const channelId = dmIdFromUser(props);
    if (!channelId) return;
    channelCtxPatch(children, { channelId, channel: props.channel });
};

const channelCtxPatch: NavContextMenuPatchCallback = (children, props: { channel?: Channel; channelId?: string; }) => {
    const channelId = channelIdFromMenu(props);
    if (!channelId) return;

    const open = (
        <Menu.MenuItem
            id="vc-grokai-open"
            label={t("openAi")}
            icon={GrokIcon}
            action={() => openGrokModal({ channelId })}
        />
    );
    const summarize = (range: SummarizeRange) => () => openGrokModal({ channelId, summarize: range });
    const summary = (
        <Menu.MenuItem
            id="vc-grokai-summarize"
            label={t("summarizeWithAi")}
            icon={SummarizeIcon}
        >
            <Menu.MenuItem id="vc-grokai-summarize-hour" label={t("summarizeHour")} action={summarize("hour")} />
            <Menu.MenuItem id="vc-grokai-summarize-today" label={t("summarizeToday")} action={summarize("today")} />
            <Menu.MenuItem id="vc-grokai-summarize-week" label={t("summarizeWeek")} action={summarize("week")} />
        </Menu.MenuItem>
    );

    const group = findGroupChildrenByChildId("mark-channel-read", children)
        ?? findGroupChildrenByChildId("copy-channel-link", children)
        ?? findGroupChildrenByChildId("copy-link", children);
    if (group) {
        group.push(open, summary);
        return;
    }
    children.push(<Menu.MenuGroup>{open}{summary}</Menu.MenuGroup>);
};

function messageHasBody(message: Message) {
    return Boolean(getMessageContent(message) || message.attachments?.length);
}

const messageCtxPatch: NavContextMenuPatchCallback = (children, { message }: { message: Message; }) => {
    if (!messageHasBody(message)) return;

    const items = [
        <Menu.MenuItem
            id="vc-grokai-draft"
            label={t("draftReply")}
            icon={DraftReplyIcon}
            action={() => openGrokModal({ draftMessage: message, channelId: message.channel_id })}
        />,
        <Menu.MenuItem
            id="vc-grokai-explain"
            label={t("explainWithAi")}
            icon={GrokIcon}
            action={() => openGrokModal({ explainMessage: message, channelId: message.channel_id })}
        />,
        <Menu.MenuItem
            id="vc-grokai-factcheck"
            label={t("factCheckWithAi")}
            icon={FactCheckIcon}
            action={() => openGrokModal({ factCheckMessage: message, channelId: message.channel_id })}
        />,
    ];

    const group = findGroupChildrenByChildId("copy-text", children)
        ?? findGroupChildrenByChildId("copy", children);
    if (!group) {
        children.push(<Menu.MenuGroup>{items}</Menu.MenuGroup>);
        return;
    }

    const at = group.findIndex(c => c?.props?.id === "copy-text" || c?.props?.id === "copy");
    group.splice(at < 0 ? group.length : at + 1, 0, ...items);
};

function factCheckPopover(message: Message) {
    if (!getMessageContent(message)) return null;

    return {
        label: t("factCheckWithAi"),
        icon: FactCheckIcon,
        message,
        channel: ChannelStore.getChannel(message.channel_id),
        onClick: () => openGrokModal({ factCheckMessage: message, channelId: message.channel_id }),
    };
}

function draftReplyPopover(message: Message) {
    if (!messageHasBody(message)) return null;

    return {
        label: t("draftReply"),
        icon: DraftReplyIcon,
        message,
        channel: ChannelStore.getChannel(message.channel_id),
        onClick: () => openGrokModal({ draftMessage: message, channelId: message.channel_id }),
    };
}

async function runPluginUpdate(language: string) {
    const Native = getNative();
    if (!Native) {
        showToast(t("updateDesktopOnly"), Toasts.Type.FAILURE);
        return;
    }

    showToast(t("updating"), Toasts.Type.MESSAGE);
    const result = await Native.applyUpdate(language);
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
    const { language, grokPath, provider, codexPath, customBaseUrl, customApiKey, customApiStyle, customModel } = settings.use(["language", "grokPath", "provider", "codexPath", "customBaseUrl", "customApiKey", "customApiStyle", "customModel"]);
    const activeProvider = resolveProvider(provider);
    const [status, setStatus] = useState<GrokStatus | null>(() => getCachedStatus(activeProvider));
    const [update, setUpdate] = useState<UpdateStatus | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setStatus(getCachedStatus(activeProvider));
        return subscribeCliStatus(() => setStatus(getCachedStatus(activeProvider)));
    }, [activeProvider]);

    useEffect(() => {
        void refreshCliStatus(activeProvider, true);
        const Native = getNative();
        if (!Native) return;
        Native.checkForUpdate(language).then(setUpdate).catch(() => { /* ignore */ });
    }, [language, grokPath, provider, codexPath, customBaseUrl, customApiKey, customApiStyle, customModel]);

    return (
        <div className={cl("settings")}>
            <strong>{status?.authenticated
                ? t(activeProvider === "custom" ? "endpointConnected" : "cliConnected", { name: providerLabel(activeProvider) })
                : t("cliStatus")}</strong>
            <div>{status?.subscription || status?.error || t("checking")}</div>
            {status?.displayName && <div>{t("account")}: {status.displayName}</div>}
            {status?.version && <div>{activeProvider === "custom" ? status.version : `CLI: ${status.version}`}</div>}
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
    description: "Chat with Grok, Codex, or a custom local OpenAI/Anthropic endpoint from Discord. Explain, fact-check, draft replies, and summarize channels.",
    authors: [{ name: "TheRealMagyar", id: 462651633709613056n }],
    searchTerms: ["aiPlugin", "GrokAi", "Grok", "xAI", "AI", "ChatGPT", "Codex", "OpenAI", "Anthropic", "Ollama", "LM Studio", "explain", "factcheck", "draft", "summarize", "notifications", "mentions"],
    tags: ["Chat", "Utility"],
    dependencies: ["ChatInputButtonAPI", "MessagePopoverAPI", "CommandsAPI", "HeaderBarAPI", "ServerListAPI"],
    settings,
    settingsAboutComponent: SettingsAbout,
    requiresRestart: true,

    async start() {
        addMessagePopoverButton("AI-Plugin-factcheck", factCheckPopover, FactCheckIcon);
        addMessagePopoverButton("AI-Plugin-draft", draftReplyPopover, DraftReplyIcon);
        try {
            if (settings.store.showNotificationCenter)
                addServerListElement(ServerListRenderPosition.Above, renderNotificationCenterButton);
        } catch {
            // ServerListAPI missing
        }
        startCliStatusWatch();
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

    stop() {
        removeMessagePopoverButton("AI-Plugin-factcheck");
        removeMessagePopoverButton("AI-Plugin-draft");
        try {
            removeServerListElement(ServerListRenderPosition.Above, renderNotificationCenterButton);
        } catch {
            // ignore
        }
        stopCliStatusWatch();
    },

    toolboxActions: {
        "Update AI-Plugin": () => runPluginUpdate(settings.store.language),
    },

    contextMenus: {
        message: messageCtxPatch,
        "channel-context": channelCtxPatch,
        "thread-context": channelCtxPatch,
        "gdm-context": channelCtxPatch,
        "user-context": userCtxPatch,
    },

    chatBarButton: {
        icon: GrokIcon,
        render: GrokChatBarButton,
    },

    headerBarButton: {
        icon: GrokIcon,
        location: "channeltoolbar",
        render: ChannelHeaderAiButton,
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
                        content: "AI-Plugin only works on desktop Discord, Vesktop, or Equibop.",
                    });
                }

                sendBotMessage(ctx.channel.id, { content: t("thinkingShort") });
                const packed = await packChannelContext({
                    channelId: ctx.channel.id,
                    prompt: question,
                    enabled: settings.store.includeChannelContext,
                });
                const provider = currentProvider();
                const stored = provider === "custom" ? await loadThread(ctx.channel.id) : null;
                const reply = await Native.sendChat({
                    prompt: withTranscript(question, packed, "chat"),
                    language: settings.store.language as "en" | "hu" | "de" | "es",
                    allowWebSearch: settings.store.allowWebSearch,
                    ...chatProviderFields(provider),
                    history: stored ? historyForRequest(stored.messages) : undefined,
                    kind: "chat",
                });

                const text = reply.ok ? reply.text : (reply.error || t("unknownError"));
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
