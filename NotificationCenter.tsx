/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RenderModalProps } from "@vencord/discord-types";
import { Modal, NavigationRouter, openModal, useEffect, useState } from "@webpack/common";

import { getBriefingState, setBriefingWindowOpen, setOpenBriefingHandler, startBriefing, subscribeBriefing } from "./briefingJob";
import { ackChannels, collectPings } from "./notifications";
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

function NotificationCenterModal({ rootProps }: { rootProps: RenderModalProps; }) {
    const Native = getNative();
    const [, setTick] = useState(0);
    const live = collectPings();
    const briefing = getBriefingState();
    const items = live.length ? live : briefing.items;
    const total = items.reduce((sum, item) => sum + item.mentionCount, 0);
    const busy = briefing.status === "running";
    const summary = briefing.summary;
    const error = briefing.error;

    useEffect(() => {
        setBriefingWindowOpen(true);
        const unsub = subscribeBriefing(() => setTick(n => n + 1));
        return () => {
            setBriefingWindowOpen(false);
            unsub();
        };
    }, []);

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
                        onClick={() => void startBriefing()}
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
                    {busy && summary && (
                        <div className={cl("nc-banner")}>{t("notifSummarizing")}</div>
                    )}
                    {!busy && !summary && !error && (
                        <div className={cl("nc-empty")}>
                            {items.length
                                ? (Native ? t("notifIdle") : t("notifNeedCli"))
                                : t("notifEmpty")}
                        </div>
                    )}
                    {error && !summary && <div className={cl("nc-empty")}>{error}</div>}
                    {error && summary && (
                        <div className={cl("nc-banner")}>{error}</div>
                    )}
                    {summary && <BriefingText text={summary} onClose={rootProps.onClose} />}
                </div>
            </div>
        </Modal>
    );
}

export function openNotificationCenter() {
    try {
        setOpenBriefingHandler(() => openNotificationCenter());
        openModal(props => <NotificationCenterModal rootProps={props} />);
    } catch {
        // ignore
    }
}
