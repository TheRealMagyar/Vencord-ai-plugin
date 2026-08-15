/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RenderModalProps } from "@vencord/discord-types";
import { Modal, NavigationRouter, openModal, useRef, useState } from "@webpack/common";

import { ackChannels, collectPings, formatPingsForAi, type PingItem } from "./notifications";
import { settings } from "./settings";
import { cl, getNative, t } from "./utils";

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/[^\s)]+)/gi;

function jumpFromHref(href: string, onClose?: () => void) {
    const match = href.match(/discord(?:app)?\.com\/channels\/([^/?#]+)\/([^/?#]+)(?:\/([^/?#]+))?/i);
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

function JumpLink({ href, label, onClose }: { href: string; label: string; onClose?: () => void; }) {
    return (
        <button
            type="button"
            className={cl("nc-link")}
            onClick={() => jumpFromHref(href, onClose)}
        >
            {label.replace(/^https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/\S+/i, t("notifOpen"))}
        </button>
    );
}

function renderInline(text: string, onClose?: () => void) {
    const parts: any[] = [];
    const re = new RegExp(LINK_RE.source, "gi");
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
        if (match.index > last)
            parts.push(text.slice(last, match.index));
        const href = match[2] || match[3] || "";
        let label = (match[1] || t("notifOpen")).trim();
        if (/^https?:\/\//i.test(label))
            label = t("notifOpen");
        parts.push(<JumpLink key={`${match.index}-${href}`} href={href} label={label} onClose={onClose} />);
        last = match.index + match[0].length;
    }
    if (last < text.length)
        parts.push(text.slice(last));
    return parts;
}

function BriefingText({ text, onClose }: { text: string; onClose?: () => void; }) {
    const paragraphs = text.trim().split(/\n{2,}/);
    return (
        <div className={cl("nc-prose")}>
            {paragraphs.map((para, i) => (
                <p key={i}>
                    {para.split("\n").map((line, j, lines) => (
                        <span key={j}>
                            {renderInline(line, onClose)}
                            {j < lines.length - 1 ? <br /> : null}
                        </span>
                    ))}
                </p>
            ))}
        </div>
    );
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
    const [summary, setSummary] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const Native = getNative();
    const total = items.reduce((sum, item) => sum + item.mentionCount, 0);

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
                    "When you mention a specific ping, add a short markdown link with a few words as the label, using EXACTLY that item's Link URL: [Open #general](https://discord.com/channels/...).",
                    "Never put the raw URL in the visible text. Every important ping needs one such link.",
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

                <div className={cl("nc-summary", { error: Boolean(error && !summary), live: busy })}>
                    {busy && !summary && (
                        <div className={cl("nc-empty")}>{t("notifSummarizing")}</div>
                    )}
                    {!busy && !summary && !error && (
                        <div className={cl("nc-empty")}>
                            {items.length
                                ? (Native ? t("notifIdle") : t("notifNeedCli"))
                                : t("notifEmpty")}
                        </div>
                    )}
                    {error && !summary && <div className={cl("nc-empty")}>{error}</div>}
                    {summary && <BriefingText text={summary} onClose={rootProps.onClose} />}
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
