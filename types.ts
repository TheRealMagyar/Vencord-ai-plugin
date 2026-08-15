/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type AiProvider = "grok" | "codex";
export type FactCheckDepth = "quick" | "balanced" | "deep";
export type AiJobKind = "chat" | "explain" | "factcheck" | "draft" | "summarize";
export type SummarizeRange = "hour" | "today" | "week";

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

export type ToolStepStatus = "running" | "done" | "error";

export interface ChatToolStep {
    id: string;
    name: string;
    status: ToolStepStatus;
    detail?: string;
}

export interface ChatProgress {
    jobId: string;
    status: "running" | "done" | "error";
    thought: string;
    text: string;
    tools: ChatToolStep[];
    sessionId: string | null;
    error: string | null;
}

export interface GrokReply {
    ok: boolean;
    text: string;
    sessionId: string | null;
    error: string | null;
    thought?: string;
    tools?: ChatToolStep[];
}

export interface ChatRequest {
    prompt: string;
    sessionId?: string | null;
    model?: string;
    language?: "en" | "hu" | "de" | "es";
    allowWebSearch?: boolean;
    grokPath?: string;
    provider?: AiProvider;
    codexPath?: string;
    kind?: AiJobKind;
    jobId?: string;
    factCheckDepth?: FactCheckDepth;
}

export interface ExplainRequest {
    content: string;
    author?: string;
    channelName?: string;
    language?: "en" | "hu" | "de" | "es";
    model?: string;
    grokPath?: string;
}

export interface ChatMessage {
    id: string;
    role: "user" | "assistant" | "system";
    text: string;
    pending?: boolean;
    error?: boolean;
    thought?: string;
    tools?: ChatToolStep[];
    at?: number;
}

export interface StoredThread {
    channelId: string;
    title: string;
    sessionId: string | null;
    sessions?: Partial<Record<AiProvider, string | null>>;
    messages: ChatMessage[];
    updatedAt: number;
}

export interface UpdateStatus {
    ok: boolean;
    available: boolean;
    pluginDir: string | null;
    local: string | null;
    remote: string | null;
    error: string | null;
}

export interface UpdateResult {
    ok: boolean;
    pulled: boolean;
    built: boolean;
    needsRestart: boolean;
    pluginDir: string | null;
    error: string | null;
}
