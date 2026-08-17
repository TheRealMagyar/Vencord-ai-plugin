/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { currentProvider, customEndpoint } from "./provider";
import { settings } from "./settings";
import type { AiProvider, GrokStatus } from "./types";
import { getNative, t } from "./utils";

const REFRESH_MS = 5 * 60 * 1000;
const FRESH_MS = 90_000;

const cache: Partial<Record<AiProvider, GrokStatus>> = {};
const checkedAt: Partial<Record<AiProvider, number>> = {};
const inflight = new Map<AiProvider, Promise<GrokStatus>>();
const listeners = new Set<() => void>();
let timer = 0;

const desktopOnly = (): GrokStatus => ({
    installed: false,
    authenticated: false,
    grokPath: null,
    version: null,
    displayName: null,
    subscription: null,
    authMode: null,
    expiresAt: null,
    error: t("desktopOnly"),
});

function emit() {
    for (const fn of listeners) {
        try {
            fn();
        } catch {
            // ignore
        }
    }
}

function customPath(provider: AiProvider) {
    if (provider === "custom") return undefined;
    const raw = provider === "codex" ? settings.store.codexPath : settings.store.grokPath;
    return raw || undefined;
}

export function getCachedStatus(provider: AiProvider) {
    return cache[provider] ?? null;
}

export function subscribeCliStatus(fn: () => void) {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

export async function refreshCliStatus(provider: AiProvider, force = false) {
    const pending = inflight.get(provider);
    if (pending) return pending;
    if (!force && cache[provider] && Date.now() - (checkedAt[provider] ?? 0) < FRESH_MS)
        return cache[provider]!;

    const Native = getNative();
    if (!Native) {
        cache[provider] = desktopOnly();
        checkedAt[provider] = Date.now();
        emit();
        return cache[provider]!;
    }

    const extra = provider === "custom" ? customEndpoint() : undefined;
    const work = Native.getStatus(provider, customPath(provider), settings.store.language, extra)
        .then(status => {
            cache[provider] = status;
            checkedAt[provider] = Date.now();
            emit();
            return status;
        })
        .catch(error => {
            const status: GrokStatus = {
                installed: false,
                authenticated: false,
                grokPath: null,
                version: null,
                displayName: null,
                subscription: null,
                authMode: null,
                expiresAt: null,
                error: error instanceof Error ? error.message : String(error),
            };
            cache[provider] = status;
            checkedAt[provider] = Date.now();
            emit();
            return status;
        })
        .finally(() => {
            if (inflight.get(provider) === work) inflight.delete(provider);
        });

    inflight.set(provider, work);
    return work;
}

export function startCliStatusWatch() {
    const current = currentProvider();
    if (current === "custom") {
        void refreshCliStatus(current);
    } else {
        const other: AiProvider = current === "codex" ? "grok" : "codex";
        void refreshCliStatus(current).then(() => refreshCliStatus(other));
    }

    if (timer) window.clearInterval(timer);
    timer = window.setInterval(() => {
        void refreshCliStatus(currentProvider(), true);
    }, REFRESH_MS);
}

export function stopCliStatusWatch() {
    if (timer) window.clearInterval(timer);
    timer = 0;
}
