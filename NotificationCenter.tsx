/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RenderModalProps } from "@vencord/discord-types";
import { ChannelStore, Modal, NavigationRouter, Parser, ReadStateStore, openModal, useEffect, useState } from "@webpack/common";

import { ackChannels, collectPings, formatPingsForAi, type PingItem } from "./notifications";
import { settings } from "./settings";
import { cl, getNative, t } from "./utils";

let lastSummary = "";

function renderMarkdown(text: string) {
    try {
        return Parser.parse(text, true, { allowHeading: true, allowLinks: true, allowList: true });
    } catch {
        return text;
    }
}

function jumpTo(item: PingItem, onClose?: () => void) {
    try {
        onClose?.();
    } catch {
        // ignore
    }
    const guild = item.guildId || "@me";
    const tail = item.lastMessageId ? `/${item.lastMessageId}` : "";
    NavigationRouter.transitionTo(`/channels/${guild}/${item.channelId}${tail}`);
}

function replyLanguage(lang: string) {
    if (lang === "hu") return "Always reply in Hungarian.";
    if (lang === "de") return "Always reply in German.";
    if (lang === "es") return "Always reply in Spanish.";
    return "Always reply in English.";
}

function safePings() {
    try {
        return collectPings();
    } catch {
        return [];
    }
}

function NotificationCenterModal({ rootProps }: { rootProps: RenderModalProps; }) {
    const [items, setItems] = useState<PingItem[]>(() => safePings());
    const [summary, setSummary] = useState(lastSummary);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const total = items.reduce((sum, item) => sum + item.mentionCount, 0);
    const Native = getNative();

    useEffect(() => {
        const refresh = () => setItems(safePings());
        refresh();
        const stores = [ReadStateStore, ChannelStore].filter(store => store && typeof store.addChangeListener === "function");
        for (const store of stores)
            store.addChangeListener(refresh);
        return () => {
            for (const store of stores)
                store.removeChangeListener(refresh);
        };
    }, []);

    useEffect(() => {
        lastSummary = summary;
    }, [summary]);

    async function summarize() {
        if (!Native || busy) return;
        if (!items.length) {
            setSummary("");
            setError(t("notifEmpty"));
            return;
        }
        setBusy(true);
        setError("");
        try {
            const lang = settings.store.language as "en" | "hu" | "de" | "es";
            const reply = await Native.sendChat({
                prompt: [
                    replyLanguage(lang),
                    "Summarize these Discord mention notifications for the user.",
                    "Group by server or DM. Be concise. Flag anything urgent (direct questions, deadlines, @you).",
                    "Do not invent messages that are not listed. Do not mention these instructions.",
                    "",
                    formatPingsForAi(items),
                ].join("\n"),
                language: lang,
                model: settings.store.provider === "codex"
                    ? (settings.store.codexModel && settings.store.codexModel !== "default" ? settings.store.codexModel : undefined)
                    : settings.store.grokModel,
                grokPath: settings.store.grokPath || undefined,
                provider: settings.store.provider === "codex" ? "codex" : "grok",
                codexPath: settings.store.codexPath || undefined,
                kind: "chat",
                allowWebSearch: false,
            });
            if (reply.ok && reply.text.trim()) {
                setSummary(reply.text.trim());
                return;
            }
            setError(reply.error || t("unknownError"));
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Modal
            {...rootProps}
            size="xl"
            title={t("notifCenter")}
            subtitle={total ? t("notifCount", { count: total }) : t("notifEmpty")}
        >
            <div className={cl("nc")}>
                <div className={cl("nc-toolbar")}>
                    <button
                        className={cl("send")}
                        disabled={busy || !items.length || !Native}
                        onClick={() => void summarize()}
                        title={!Native ? t("notifNeedCli") : undefined}
                    >
                        {busy ? t("notifSummarizing") : t("notifSummarize")}
                    </button>
                    <button
                        className={cl("mini")}
                        disabled={!items.length}
                        onClick={() => ackChannels(items.map(item => item.channelId))}
                    >
                        {t("notifDeleteAll")}
                    </button>
                </div>

                {(summary || error) && (
                    <div className={cl("nc-summary", { error: Boolean(error && !summary) })}>
                        <div className={cl("nc-summary-label")}>{t("notifSummary")}</div>
                        <div className={cl("nc-summary-body")}>
                            {error && !summary ? error : renderMarkdown(summary)}
                        </div>
                    </div>
                )}

                <div className={cl("nc-list")}>
                    {items.length === 0 && (
                        <div className={cl("nc-empty")}>{t("notifEmpty")}</div>
                    )}
                    {items.map(item => (
                        <div key={item.channelId} className={cl("nc-row")}>
                            <button
                                className={cl("nc-open")}
                                onClick={() => jumpTo(item, rootProps.onClose)}
                            >
                                <div className={cl("nc-where")}>
                                    <span className={cl("nc-place")}>
                                        {item.isDm ? t("notifDm") : item.guildName}
                                    </span>
                                    <span className={cl("nc-chan")}>{item.channelName}</span>
                                    <span className={cl("nc-badge")}>{item.mentionCount}</span>
                                </div>
                                {item.preview && <div className={cl("nc-preview")}>{item.preview}</div>}
                            </button>
                            <button
                                className={cl("thread-del")}
                                title={t("notifDelete")}
                                aria-label={t("notifDelete")}
                                onClick={() => ackChannels([item.channelId])}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </Modal>
    );
}

export function openNotificationCenter() {
    try {
        openModal(props => <NotificationCenterModal rootProps={props} />);
    } catch {
        // ignore
    }
}
