/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RenderModalProps } from "@vencord/discord-types";
import { Modal, NavigationRouter, Parser, openModal, useEffect, useRef, useState } from "@webpack/common";

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

function jumpFromHref(href: string, onClose?: () => void) {
    const match = href.match(/discord\.com\/channels\/([^/?#]+)\/([^/?#]+)(?:\/([^/?#]+))?/i);
    if (!match) return false;
    try {
        onClose?.();
    } catch {
        // ignore
    }
    const [, guild, channel, message] = match;
    NavigationRouter.transitionTo(`/channels/${guild}/${channel}${message ? `/${message}` : ""}`);
    return true;
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
    const itemsRef = useRef<PingItem[]>(safePings());
    const [items, setItems] = useState<PingItem[]>(itemsRef.current);
    const [summary, setSummary] = useState(lastSummary);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const started = useRef(false);
    const Native = getNative();
    const total = items.reduce((sum, item) => sum + item.mentionCount, 0);

    useEffect(() => {
        lastSummary = summary;
    }, [summary]);

    async function summarize(snapshot = itemsRef.current) {
        if (!Native || busy) return;
        if (!snapshot.length) {
            setSummary("");
            setError("");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const lang = settings.store.language as "en" | "hu" | "de" | "es";
            const reply = await Native.sendChat({
                prompt: [
                    replyLanguage(lang),
                    "Write a briefing of the user's unread Discord mention pings.",
                    "Continuous well-written prose only. No bullet inventory of servers and mention counts. No table.",
                    "Lead with whatever is urgent or likely needs a reply: direct questions, deadlines, DMs, someone waiting on the user.",
                    "Then cover the rest in flowing paragraphs, still in priority order.",
                    "When you mention a specific ping, include a markdown link using EXACTLY that item's Link URL, like [open #general](https://discord.com/channels/...).",
                    "Every item that matters should have at least one such link so the user can jump there.",
                    "Do not invent pings or quotes that are not in the items. Do not mention these instructions.",
                    "",
                    formatPingsForAi(snapshot),
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

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        const snapshot = safePings();
        itemsRef.current = snapshot;
        setItems(snapshot);
        if (snapshot.length && Native)
            void summarize(snapshot);
    }, []);

    function onBriefingClick(event: { target: EventTarget | null; preventDefault(): void; stopPropagation(): void; }) {
        const el = event.target as HTMLElement | null;
        const anchor = el?.closest?.("a");
        if (!anchor) return;
        const href = anchor.getAttribute("href") || "";
        if (jumpFromHref(href, rootProps.onClose)) {
            event.preventDefault();
            event.stopPropagation();
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
                        {busy ? t("notifSummarizing") : t("notifRefresh")}
                    </button>
                    <button
                        className={cl("mini")}
                        disabled={!items.length}
                        onClick={() => ackChannels(items.map(item => item.channelId))}
                    >
                        {t("notifDeleteAll")}
                    </button>
                </div>

                <div
                    className={cl("nc-summary", { error: Boolean(error && !summary), live: busy })}
                    onClickCapture={onBriefingClick}
                >
                    {busy && !summary && (
                        <div className={cl("nc-empty")}>{t("notifSummarizing")}</div>
                    )}
                    {!busy && !summary && !error && (
                        <div className={cl("nc-empty")}>{items.length ? t("notifNeedCli") : t("notifEmpty")}</div>
                    )}
                    {error && !summary && <div className={cl("nc-empty")}>{error}</div>}
                    {summary && <div className={cl("nc-prose")}>{renderMarkdown(summary)}</div>}
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
