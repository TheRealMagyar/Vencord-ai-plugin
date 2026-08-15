/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { ChannelStore, ReadStateStore, Tooltip, useStateFromStores } from "@webpack/common";

import { openNotificationCenter } from "./NotificationCenter";
import { totalMentionCount } from "./notifications";
import { settings } from "./settings";
import { cl, t } from "./utils";

function BellIcon() {
    return (
        <svg viewBox="0 0 24 24" width={22} height={22} aria-hidden="true" fill="currentColor">
            <path d="M12 2a6 6 0 0 0-6 6v2.3c0 .6-.2 1.2-.6 1.7L3.8 14.8A1.5 1.5 0 0 0 5 17.2h14a1.5 1.5 0 0 0 1.2-2.4l-1.6-2.8c-.4-.5-.6-1.1-.6-1.7V8a6 6 0 0 0-6-6Zm0 20a3 3 0 0 0 2.8-2H9.2A3 3 0 0 0 12 22Z" />
        </svg>
    );
}

function NotificationCenterButton() {
    settings.use(["language"]);
    const count = useStateFromStores([ReadStateStore, ChannelStore], () => totalMentionCount());

    return (
        <div className={cl("sl")}>
            <Tooltip text={t("notifCenter")} position="right">
                {({ onMouseEnter, onMouseLeave }) => (
                    <button
                        type="button"
                        className={cl("sl-btn")}
                        aria-label={t("notifCenter")}
                        onMouseEnter={onMouseEnter}
                        onMouseLeave={onMouseLeave}
                        onClick={() => openNotificationCenter()}
                    >
                        <BellIcon />
                        {count > 0 && (
                            <span className={cl("sl-badge")}>{count > 99 ? "99+" : count}</span>
                        )}
                    </button>
                )}
            </Tooltip>
        </div>
    );
}

export const renderNotificationCenterButton = ErrorBoundary.wrap(NotificationCenterButton, { noop: true });
