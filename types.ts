/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface GrokStatus {
    installed: boolean;
    authenticated: boolean;
    grokPath: string | null;
    version: string | null;
    displayName: string | null;
    subscription: string | null;
    authMode: string | null;
    expiresAt: string | null;
    error: string | null;
}

export interface GrokReply {
    ok: boolean;
    text: string;
    sessionId: string | null;
    error: string | null;
}

export interface ChatRequest {
    prompt: string;
    sessionId?: string | null;
    model?: string;
    language?: "auto" | "hu" | "en";
    allowWebSearch?: boolean;
    grokPath?: string;
}

export interface ExplainRequest {
    content: string;
    author?: string;
    channelName?: string;
    language?: "auto" | "hu" | "en";
    model?: string;
    grokPath?: string;
}

export interface ChatMessage {
    id: string;
    role: "user" | "assistant" | "system";
    text: string;
    pending?: boolean;
}
