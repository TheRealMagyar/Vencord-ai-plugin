/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RenderModalProps } from "@vencord/discord-types";
import { Modal, NavigationRouter, openModal, ReadStateStore, useEffect, useState } from "@webpack/common";

import { clearBriefing, getBriefingState, setBriefingWindowOpen, setOpenBriefingHandler, startBriefing, subscribeBriefing } from "./briefingJob";
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
    const items = live;
    const total = items.reduce((sum, item) => sum + item.mentionCount, 0);
    const busy = briefing.status === "running";
    const summary = briefing.summary;
    const error = briefing.error;
    const busyLabel = briefing.phase === "reading" ? t("notifReading") : t("notifSummarizing");

    useEffect(() => {
        setBriefingWindowOpen(true);
        const refresh = () => setTick(n => n + 1);
        const unsub = subscribeBriefing(refresh);
        try {
            ReadStateStore.addChangeListener(refresh);
        } catch {
            // ignore
        }
        return () => {
            setBriefingWindowOpen(false);
            unsub();
            try {
                ReadStateStore.removeChangeListener(refresh);
            } catch {
                // ignore
            }
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
                        {busy ? busyLabel : t("notifSummarize")}
                    </button>
                    <button
                        className={cl("mini")}
                        disabled={!items.length && !summary && !busy}
                        onClick={() => {
                            ackChannels();
                            clearBriefing();
                            setTick(n => n + 1);
                        }}
                    >
                        {t("notifDeleteAll")}
                    </button>
                </div>

                <div className={cl("nc-summary", { error: Boolean(error && !summary), live: busy })}>
                    {busy && !summary && (
                        <div className={cl("nc-empty")}>{busyLabel}</div>
                    )}
                    {busy && summary && (
                        <div className={cl("nc-banner")}>{busyLabel}</div>
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
