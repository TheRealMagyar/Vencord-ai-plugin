/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import ErrorBoundary from "@components/ErrorBoundary";
import { Tooltip } from "@webpack/common";

import { cl } from "./utils";

function openCenter() {
    try {
        const mod = require("./NotificationCenter") as { openNotificationCenter: () => void; };
        mod.openNotificationCenter();
    } catch {
        // never throw from the guild rail
    }
}

function NotificationCenterButton() {
    return (
        <div className={cl("sl")}>
            <Tooltip text="AI notifications" position="right">
                {({ onMouseEnter, onMouseLeave }) => (
                    <div
                        className={cl("sl-btn")}
                        role="button"
                        tabIndex={0}
                        aria-label="AI notifications"
                        onMouseEnter={onMouseEnter}
                        onMouseLeave={onMouseLeave}
                        onClick={openCenter}
                        onKeyDown={event => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                openCenter();
                            }
                        }}
                    >
                        <svg viewBox="0 0 24 24" width={24} height={24} aria-hidden="true" fill="currentColor">
                            <path d="M12 2a6 6 0 0 0-6 6v2.3c0 .6-.2 1.2-.6 1.7L3.8 14.8A1.5 1.5 0 0 0 5 17.2h14a1.5 1.5 0 0 0 1.2-2.4l-1.6-2.8c-.4-.5-.6-1.1-.6-1.7V8a6 6 0 0 0-6-6Zm0 20a3 3 0 0 0 2.8-2H9.2A3 3 0 0 0 12 22Z" />
                        </svg>
                    </div>
                )}
            </Tooltip>
        </div>
    );
}

export function renderNotificationCenterButton() {
    return (
        <ErrorBoundary noop>
            <NotificationCenterButton />
        </ErrorBoundary>
    );
}
