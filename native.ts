/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChildProcess, execFile, spawn } from "child_process";
import { shell } from "electron";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

import { nativeT } from "./nativeI18n";
import type { AiProvider, ChatProgress, ChatRequest, ChatToolStep, ExplainRequest, FactCheckDepth, GrokReply, GrokStatus, UpdateResult, UpdateStatus } from "./types";

const execFileAsync = promisify(execFile);
const GROK_BIN = process.platform === "win32" ? "grok.exe" : "grok";
const PROMPT_TIMEOUT_MS = 180_000;
const PROBE_TIMEOUT_MS = 12_000;
const JOB_TTL_MS = 60_000;
const MAX_THOUGHT = 6_000;

const jobs = new Map<string, ChatProgress>();
const processes = new Map<string, ChildProcess>();

function trackProcess(jobId: string, child: ChildProcess) {
    processes.set(jobId, child);
    const drop = () => {
        if (processes.get(jobId) === child) processes.delete(jobId);
    };
    child.on("close", drop);
    child.on("error", drop);
}

function newJob(jobId?: string): ChatProgress {
    const id = jobId?.trim() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const progress: ChatProgress = {
        jobId: id,
        status: "running",
        thought: "",
        text: "",
        tools: [],
        sessionId: null,
        error: null,
    };
    jobs.set(id, progress);
    return progress;
}

function finishJob(progress: ChatProgress, reply: GrokReply) {
    progress.status = reply.ok ? "done" : "error";
    progress.text = reply.text;
    progress.sessionId = reply.sessionId;
    progress.error = reply.error;
    setTimeout(() => jobs.delete(progress.jobId), JOB_TTL_MS);
}

function clipThought(text: string) {
    if (text.length <= MAX_THOUGHT) return text;
    return text.slice(text.length - MAX_THOUGHT);
}

function upsertTool(progress: ChatProgress, step: ChatToolStep) {
    const existing = progress.tools.find(tool => tool.id === step.id);
    if (existing) {
        existing.name = step.name || existing.name;
        existing.status = step.status;
        if (step.detail) existing.detail = step.detail;
        return;
    }
    progress.tools.push(step);
}

function asText(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toolDetail(raw: unknown) {
    if (!raw || typeof raw !== "object") return undefined;
    const rec = raw as Record<string, unknown>;
    return asText(rec.query) || asText(rec.url) || asText(rec.command);
}

function grokHome() {
    return process.env.GROK_HOME || join(homedir(), ".grok");
}

function candidatePaths(customPath?: string) {
    const home = grokHome();
    const extras = (process.env.PATH ?? "")
        .split(process.platform === "win32" ? ";" : ":")
        .filter(Boolean)
        .map(dir => join(dir, GROK_BIN));

    return [
        customPath?.trim(),
        join(home, "bin", GROK_BIN),
        join(homedir(), ".local", "bin", GROK_BIN),
        join(homedir(), "bin", GROK_BIN),
        ...extras,
    ].filter((p): p is string => Boolean(p));
}

function resolveGrokPath(customPath?: string) {
    for (const candidate of candidatePaths(customPath)) {
        if (existsSync(candidate)) return candidate;
    }
    return null;
}

function isolatedCwd() {
    const dir = join(tmpdir(), "vencord-grok-ai");
    mkdirSync(dir, { recursive: true });
    return dir;
}

function readAuthMeta() {
    try {
        const raw = JSON.parse(readFileSync(join(grokHome(), "auth.json"), "utf8")) as Record<string, unknown>;
        const entry = Object.values(raw).find(value => value && typeof value === "object") as Record<string, unknown> | undefined;
        if (!entry) return { present: false };

        return {
            present: true,
            displayName: typeof entry.first_name === "string" ? entry.first_name : null,
            authMode: typeof entry.auth_mode === "string" ? entry.auth_mode : "session",
            expiresAt: typeof entry.expires_at === "string" ? entry.expires_at : null,
        };
    } catch {
        return { present: false };
    }
}

function subscriptionFromModelsOutput(stdout: string, authPresent: boolean) {
    const text = stdout.toLowerCase();
    if (text.includes("logged in with grok.com"))
        return "grok.com · SuperGrok / X Premium+";
    if (text.includes("logged in"))
        return "Grok session";
    if (process.env.XAI_API_KEY)
        return "XAI_API_KEY";
    if (authPresent)
        return "Cached Grok session";
    return null;
}

function runFile(file: string, args: string[], timeout: number) {
    return execFileAsync(file, args, {
        timeout,
        windowsHide: true,
        env: {
            ...process.env,
            GROK_DISABLE_AUTOUPDATER: "1",
            RUST_LOG: "off",
        },
    });
}

function resolveCodexPath(customPath?: string) {
    if (customPath?.trim() && existsSync(customPath.trim())) return customPath.trim();

    const binRoot = join(homedir(), "AppData", "Local", "OpenAI", "Codex", "bin");
    if (existsSync(binRoot)) {
        const newest = readdirSync(binRoot, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => join(binRoot, entry.name, process.platform === "win32" ? "codex.exe" : "codex"))
            .filter(existsSync)
            .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
        if (newest) return newest;
    }

    const extras = [
        join(homedir(), ".codex", "bin", process.platform === "win32" ? "codex.exe" : "codex"),
        ...(process.env.PATH ?? "")
            .split(process.platform === "win32" ? ";" : ":")
            .filter(Boolean)
            .map(dir => join(dir, process.platform === "win32" ? "codex.exe" : "codex")),
    ];
    return extras.find(existsSync) ?? null;
}

function readCodexAuth() {
    try {
        const raw = JSON.parse(readFileSync(join(homedir(), ".codex", "auth.json"), "utf8")) as {
            auth_mode?: string;
            tokens?: { id_token?: string; };
        };
        let displayName: string | null = null;
        let plan: string | null = null;
        const token = raw.tokens?.id_token;
        if (typeof token === "string") {
            try {
                const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as Record<string, any>;
                const auth = payload["https://api.openai.com/auth"] ?? {};
                const profile = payload["https://api.openai.com/profile"] ?? {};
                plan = auth.chatgpt_plan_type ?? null;
                displayName = profile.name ?? payload.name ?? null;
            } catch {
                // never surface tokens
            }
        }
        const planLabel = plan
            ? `ChatGPT ${String(plan).charAt(0).toUpperCase()}${String(plan).slice(1)}`
            : (raw.auth_mode === "chatgpt" ? "ChatGPT session" : "Codex session");
        return {
            present: Boolean(raw.auth_mode || raw.tokens),
            displayName,
            subscription: planLabel,
            authMode: raw.auth_mode ?? "chatgpt",
        };
    } catch {
        return { present: false, displayName: null, subscription: null, authMode: null };
    }
}

async function getCodexStatus(customPath?: string, language?: string): Promise<GrokStatus> {
    const auth = readCodexAuth();
    const codexPath = resolveCodexPath(customPath);
    if (!codexPath) {
        return {
            installed: false,
            authenticated: false,
            grokPath: null,
            version: null,
            displayName: auth.displayName,
            subscription: auth.present ? auth.subscription : null,
            authMode: auth.authMode,
            expiresAt: null,
            error: nativeT(language, "codexMissing"),
        };
    }

    let version: string | null = null;
    try {
        const { stdout } = await runFile(codexPath, ["--version"], PROBE_TIMEOUT_MS);
        version = stdout.trim().split(/\r?\n/)[0] || null;
    } catch {
        version = null;
    }

    const authenticated = auth.present;
    return {
        installed: true,
        authenticated,
        grokPath: codexPath,
        version,
        displayName: auth.displayName,
        subscription: auth.subscription,
        authMode: auth.authMode,
        expiresAt: null,
        error: authenticated ? null : nativeT(language, "codexNotLoggedIn"),
    };
}

export async function getStatus(_event: unknown, providerOrPath?: string, maybePath?: string, language?: string): Promise<GrokStatus> {
    const provider: AiProvider = providerOrPath === "codex" ? "codex" : "grok";
    const customPath = providerOrPath === "codex" || providerOrPath === "grok" ? maybePath : providerOrPath;
    if (provider === "codex") return getCodexStatus(customPath, language);

    const grokPath = resolveGrokPath(customPath);
    const auth = readAuthMeta();

    if (!grokPath) {
        return {
            installed: false,
            authenticated: false,
            grokPath: null,
            version: null,
            displayName: auth.displayName ?? null,
            subscription: process.env.XAI_API_KEY ? "XAI_API_KEY" : null,
            authMode: auth.authMode ?? null,
            expiresAt: auth.expiresAt ?? null,
            error: nativeT(language, "grokMissing"),
        };
    }

    let version: string | null = null;
    let modelsOut = "";
    try {
        const { stdout } = await runFile(grokPath, ["--version"], PROBE_TIMEOUT_MS);
        version = stdout.trim().split(/\r?\n/)[0] || null;
    } catch {
        version = null;
    }

    try {
        const { stdout, stderr } = await runFile(grokPath, ["models"], PROBE_TIMEOUT_MS);
        modelsOut = `${stdout}\n${stderr}`;
    } catch (error) {
        const err = error as { stdout?: string; stderr?: string; message?: string; };
        modelsOut = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
        if (!modelsOut.trim() && !auth.present && !process.env.XAI_API_KEY) {
            return {
                installed: true,
                authenticated: false,
                grokPath,
                version,
                displayName: auth.displayName ?? null,
                subscription: null,
                authMode: auth.authMode ?? null,
                expiresAt: auth.expiresAt ?? null,
                error: nativeT(language, "grokLoginFailed", { error: err.message ?? "unknown" }),
            };
        }
    }

    const subscription = subscriptionFromModelsOutput(modelsOut, auth.present);
    const authenticated = Boolean(subscription) && !/not logged in|please log in|sign in to grok/i.test(modelsOut);

    return {
        installed: true,
        authenticated,
        grokPath,
        version,
        displayName: auth.displayName ?? null,
        subscription,
        authMode: auth.authMode ?? (process.env.XAI_API_KEY ? "api_key" : null),
        expiresAt: auth.expiresAt ?? null,
        error: authenticated ? null : nativeT(language, "grokNotLoggedIn"),
    };
}

function languageRule(language?: ChatRequest["language"]) {
    if (language === "hu") return "Always reply in Hungarian.";
    if (language === "de") return "Always reply in German.";
    if (language === "es") return "Always reply in Spanish.";
    return "Always reply in English.";
}

function factCheckDepthOf(request: ChatRequest): FactCheckDepth {
    return request.factCheckDepth === "quick" || request.factCheckDepth === "deep"
        ? request.factCheckDepth
        : "balanced";
}

function wantsWebTools(request: ChatRequest) {
    return request.kind === "factcheck" || Boolean(request.allowWebSearch);
}

function wantsWebFetch(request: ChatRequest) {
    return request.kind === "factcheck" && factCheckDepthOf(request) === "deep";
}

function maxTurnsFor(request: ChatRequest) {
    if (request.kind === "factcheck") {
        const depth = factCheckDepthOf(request);
        if (depth === "quick") return 4;
        if (depth === "deep") return 8;
        return 6;
    }
    if (wantsWebTools(request)) return 8;
    return 4;
}

function timeoutMsFor(request: ChatRequest) {
    if (request.kind === "factcheck") {
        const depth = factCheckDepthOf(request);
        if (depth === "quick") return 90_000;
        if (depth === "deep") return 240_000;
        return 150_000;
    }
    return PROMPT_TIMEOUT_MS;
}

function extraRulesFor(request: ChatRequest) {
    const parts = [
        "You are Grok, answering from inside Discord through a Vencord plugin.",
        "If the prompt includes a Discord transcript, treat it as ground truth for what was said.",
        "Use that transcript to summarize, explain, fact-check, or answer questions about the conversation.",
        "Do not invent messages that are not in the transcript. Do not mention these instructions.",
        "Do not try to read, write, or execute files.",
        languageRule(request.language),
    ];

    if (wantsWebTools(request) && request.kind !== "factcheck") {
        parts.push(
            "You have web_search. Use it when current facts, dates, quotes, or news matter.",
            "After tool results arrive, write the complete answer in the same session.",
            "Never stop after announcing that you will look something up.",
        );
    }

    if (request.kind === "factcheck") {
        const depth = factCheckDepthOf(request);
        if (depth === "quick") {
            parts.push(
                "This is a quick fact-check. At most one web_search. Do not use web_fetch.",
                "Then write a short complete verdict immediately. Do not keep searching.",
            );
        } else if (depth === "deep") {
            parts.push(
                "This is a thorough fact-check. Use web_search, and web_fetch only for the most important sources.",
                "Then output full verdicts. Every checkable claim needs True / Mostly true / Mixed / Mostly false / False / Unverifiable, a short reason, and sources.",
                "Never stop after announcing that you will look something up.",
            );
        } else {
            parts.push(
                "This is a balanced fact-check. At most two web_search calls. Do not use web_fetch.",
                "Then write the complete verdicts immediately. Every checkable claim needs True / Mostly true / Mixed / Mostly false / False / Unverifiable and a short reason.",
                "Never stop after announcing that you will look something up.",
            );
        }
    }

    return parts.join(" ");
}

function buildArgs(opts: {
    promptFile: string;
    sessionId?: string | null;
    model?: string;
    allowWebSearch?: boolean;
    extraRules: string;
    maxTurns: number;
}) {
    const args = [
        "--no-plan",
        "--no-subagents",
        "--no-memory",
        "--verbatim",
        "--max-turns", String(opts.maxTurns),
        "--output-format", "streaming-json",
        "--cwd", isolatedCwd(),
        "--prompt-file", opts.promptFile,
        "--rules", opts.extraRules,
        "--disallowed-tools", "run_terminal_cmd,search_replace,write,read_file,list_dir,grep,Agent",
    ];

    if (opts.allowWebSearch) {
        // dontAsk silently denies tools that are not on an allow list.
        // always-approve lets web_search / web_fetch actually run.
        args.push(
            "--always-approve",
            "--allow", "WebSearch",
            "--allow", "WebFetch",
        );
    } else {
        args.push("--permission-mode", "dontAsk", "--disable-web-search");
    }

    if (opts.model)
        args.push("-m", opts.model);

    if (opts.sessionId)
        args.push("--resume", opts.sessionId);

    return args;
}

function extractJsonObjects(raw: string): Record<string, unknown>[] {
    const trimmed = raw.trim();
    if (!trimmed) return [];

    try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
            return [parsed as Record<string, unknown>];
        if (Array.isArray(parsed))
            return parsed.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
    } catch {
        // walk objects below
    }

    const objects: Record<string, unknown>[] = [];
    let start = -1;
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (inString) {
            if (escape) escape = false;
            else if (ch === "\\") escape = true;
            else if (ch === "\"") inString = false;
            continue;
        }
        if (ch === "\"") {
            inString = true;
            continue;
        }
        if (ch === "{") {
            if (depth === 0) start = i;
            depth++;
        } else if (ch === "}") {
            depth--;
            if (depth === 0 && start >= 0) {
                try {
                    objects.push(JSON.parse(trimmed.slice(start, i + 1)) as Record<string, unknown>);
                } catch {
                    // skip malformed slice
                }
                start = -1;
            }
        }
    }

    return objects;
}

function stringField(value: unknown): string | null {
    if (typeof value === "string" && value.trim()) return value.trim();
    return null;
}

function textFromPayload(data: Record<string, unknown>) {
    for (const key of ["text", "result", "output_text", "message", "content", "data", "delta"] as const) {
        const direct = stringField(data[key]);
        if (direct) return direct;
        const nested = data[key];
        if (nested && typeof nested === "object") {
            const inner = stringField((nested as { text?: unknown; }).text)
                || stringField((nested as { content?: unknown; }).content)
                || stringField((nested as { data?: unknown; }).data);
            if (inner) return inner;
        }
    }

    const messages = data.messages;
    if (Array.isArray(messages)) {
        for (let i = messages.length - 1; i >= 0; i--) {
            const item = messages[i];
            if (!item || typeof item !== "object") continue;
            const rec = item as Record<string, unknown>;
            const text = stringField(rec.text) || stringField(rec.content) || stringField(rec.result) || stringField(rec.data);
            if (text) return text;
        }
    }

    return null;
}

function textFromStream(objects: Record<string, unknown>[]) {
    const parts: string[] = [];
    for (const data of objects) {
        const type = typeof data.type === "string" ? data.type : "";
        if (type === "error" || type === "thought" || type === "available_commands" || type === "usage")
            continue;
        if (type === "text" || type === "assistant" || type === "message" || type === "agent_message") {
            const chunk = stringField(data.data) || textFromPayload(data);
            if (chunk) parts.push(chunk);
        }
    }
    if (parts.length) return parts.join("");
    for (let i = objects.length - 1; i >= 0; i--) {
        if (objects[i].type === "error") continue;
        const text = textFromPayload(objects[i]);
        if (text) return text;
    }
    return null;
}

function sessionIdFrom(data: Record<string, unknown>) {
    return stringField(data.sessionId) || stringField(data.session_id);
}

function looksLikeCliError(text: string) {
    return /^(error:|session\s)|not found|failed to restore|unknown session|invalid session|not logged in|please log in/i.test(text.trim());
}

function parseReply(stdout: string, language?: string): GrokReply {
    const trimmed = stdout.trim();
    if (!trimmed) {
        return { ok: false, text: "", sessionId: null, error: nativeT(language, "grokEmpty") };
    }

    const objects = extractJsonObjects(trimmed);
    if (!objects.length) {
        if (looksLikeCliError(trimmed))
            return { ok: false, text: "", sessionId: null, error: clipCliError(trimmed) };
        return { ok: true, text: trimmed, sessionId: null, error: null };
    }

    const lastError = [...objects].reverse().find(data => data.type === "error");
    let sessionId: string | null = null;
    for (const data of objects)
        sessionId = sessionIdFrom(data) || sessionId;

    const text = textFromStream(objects);
    if (text)
        return { ok: true, text, sessionId, error: null };

    return {
        ok: false,
        text: "",
        sessionId,
        error: lastError
            ? (stringField(lastError.message) || nativeT(language, "grokError"))
            : nativeT(language, "grokParse"),
    };
}

function applyGrokEvent(progress: ChatProgress, event: Record<string, unknown>) {
    const type = event.type;
    if (type === "thought") {
        const chunk = typeof event.data === "string" ? event.data : "";
        if (chunk) progress.thought = clipThought(progress.thought + chunk);
        return;
    }
    if (type === "text" || type === "assistant" || type === "message" || type === "agent_message") {
        const chunk = typeof event.data === "string"
            ? event.data
            : (asText(event.text) || asText(event.content) || asText(event.delta) || "");
        if (!chunk) return;
        const acc = (progress as ChatProgress & { _rawText?: string; _postTool?: string; _sawTool?: boolean; });
        acc._rawText = (acc._rawText || "") + chunk;
        if (acc._sawTool) acc._postTool = (acc._postTool || "") + chunk;
        progress.text = (acc._sawTool && acc._postTool?.trim() ? acc._postTool : acc._rawText).trim();
        return;
    }
    if (type === "tool_call") {
        const acc = progress as ChatProgress & { _sawTool?: boolean; _postTool?: string; };
        acc._sawTool = true;
        acc._postTool = "";
        const id = asText(event.toolCallId) || `tool-${progress.tools.length}`;
        upsertTool(progress, {
            id,
            name: asText(event.toolName) || asText(event.title) || asText(event.kind) || "tool",
            status: event.status === "completed" ? "done" : "running",
            detail: toolDetail(event.rawInput) || asText(event.title),
        });
        return;
    }
    if (type === "tool_call_update") {
        const id = asText(event.toolCallId);
        if (!id) return;
        const existing = progress.tools.find(tool => tool.id === id);
        const detail = toolDetail(event.rawOutput) || existing?.detail;
        upsertTool(progress, {
            id,
            name: existing?.name || "tool",
            status: event.status === "completed" || event.status === "done" ? "done" : "running",
            detail,
        });
        return;
    }
    if (type === "end") {
        progress.sessionId = asText(event.sessionId) || progress.sessionId;
        return;
    }
    if (type === "error") {
        progress.error = asText(event.message) || asText(event.error) || nativeT(undefined, "grokError");
        progress.status = "error";
    }
}

function createLineParser(onEvent: (event: Record<string, unknown>) => void) {
    let buf = "";
    return {
        push(chunk: string) {
            buf += chunk;
            let idx = buf.indexOf("\n");
            while (idx >= 0) {
                const line = buf.slice(0, idx).trim();
                buf = buf.slice(idx + 1);
                if (line.startsWith("{")) {
                    try {
                        onEvent(JSON.parse(line) as Record<string, unknown>);
                    } catch {
                        // skip
                    }
                }
                idx = buf.indexOf("\n");
            }
        },
        flush() {
            const line = buf.trim();
            buf = "";
            if (!line.startsWith("{")) return;
            try {
                onEvent(JSON.parse(line) as Record<string, unknown>);
            } catch {
                // skip
            }
        },
    };
}

function spawnGrok(grokPath: string, args: string[], opts: { allowFetch: boolean; timeoutMs: number; progress: ChatProgress; }) {
    return new Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean; }>((resolve, reject) => {
        const child = spawn(grokPath, args, {
            cwd: isolatedCwd(),
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
            env: {
                ...process.env,
                GROK_DISABLE_AUTOUPDATER: "1",
                GROK_WEB_FETCH: opts.allowFetch ? "1" : "0",
                RUST_LOG: "off",
            },
        });
        trackProcess(opts.progress.jobId, child);

        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, opts.timeoutMs);

        const lines = createLineParser(event => applyGrokEvent(opts.progress, event));
        child.stdout?.setEncoding("utf8");
        child.stderr?.setEncoding("utf8");
        child.stdout?.on("data", chunk => {
            stdout += chunk;
            lines.push(chunk);
        });
        child.stderr?.on("data", chunk => {
            stderr += chunk;
            lines.push(chunk);
        });
        child.on("error", error => {
            clearTimeout(timer);
            reject(error);
        });
        child.on("close", code => {
            clearTimeout(timer);
            lines.flush();
            resolve({ stdout, stderr, code, timedOut });
        });
    });
}

async function runPrompt(request: ChatRequest, progress: ChatProgress): Promise<GrokReply> {
    const grokPath = resolveGrokPath(request.grokPath);
    if (!grokPath) {
        return {
            ok: false,
            text: "",
            sessionId: null,
            error: nativeT(request.language, "grokNotFound"),
        };
    }

    const promptDir = mkdtempSync(join(tmpdir(), "vc-grokai-"));
    const promptFile = join(promptDir, "prompt.txt");

    try {
        writeFileSync(promptFile, request.prompt, "utf8");

        const allowWebSearch = wantsWebTools(request);
        const timeoutMs = timeoutMsFor(request);
        const args = buildArgs({
            promptFile,
            sessionId: request.sessionId,
            model: request.model,
            allowWebSearch,
            extraRules: extraRulesFor(request),
            maxTurns: maxTurnsFor(request),
        });

        const { stdout, stderr, code, timedOut } = await spawnGrok(grokPath, args, {
            allowFetch: wantsWebFetch(request),
            timeoutMs,
            progress,
        });

        const reply = finishGrokReply(progress, {
            stdout,
            stderr,
            code,
            timedOut,
            timeoutMs,
            language: request.language,
        });
        if (reply.ok || !request.sessionId || !shouldRetryGrokWithoutSession(reply, stderr))
            return reply;

        progress.sessionId = null;
        progress.error = null;
        progress.status = "running";
        progress.text = "";
        progress.thought = "";
        progress.tools = [];
        const acc = progress as ChatProgress & { _rawText?: string; _postTool?: string; _sawTool?: boolean; };
        acc._rawText = "";
        acc._postTool = "";
        acc._sawTool = false;

        const retryArgs = buildArgs({
            promptFile,
            sessionId: null,
            model: request.model,
            allowWebSearch,
            extraRules: extraRulesFor(request),
            maxTurns: maxTurnsFor(request),
        });
        const retry = await spawnGrok(grokPath, retryArgs, {
            allowFetch: wantsWebFetch(request),
            timeoutMs,
            progress,
        });
        return finishGrokReply(progress, {
            stdout: retry.stdout,
            stderr: retry.stderr,
            code: retry.code,
            timedOut: retry.timedOut,
            timeoutMs,
            language: request.language,
        });
    } catch (error) {
        return {
            ok: false,
            text: "",
            sessionId: null,
            error: error instanceof Error ? error.message : String(error),
        };
    } finally {
        rmSync(promptDir, { recursive: true, force: true });
    }
}

function shouldRetryGrokWithoutSession(reply: GrokReply, stderr = "") {
    const err = `${reply.error || ""} ${stderr}`.toLowerCase();
    return /not found|unknown session|failed to restore|invalid session|invalid thread|resume|404|empty reply|üres válasz|leere antwort|respuesta vacía/.test(err);
}

function finishGrokReply(
    progress: ChatProgress,
    extra: {
        stdout: string;
        stderr?: string;
        code?: number | null;
        timedOut?: boolean;
        timeoutMs?: number;
        language?: string;
    },
): GrokReply {
    const streamedText = progress.text.trim();
    const extras = { thought: progress.thought || undefined, tools: progress.tools };
    if (extra.timedOut && !streamedText) {
        return {
            ok: false,
            text: "",
            sessionId: progress.sessionId,
            error: nativeT(extra.language, "timedOutFactCheck", { seconds: (extra.timeoutMs || PROMPT_TIMEOUT_MS) / 1000 }),
            ...extras,
        };
    }
    if (streamedText)
        return { ok: true, text: streamedText, sessionId: progress.sessionId, error: null, ...extras };

    if (progress.error)
        return { ok: false, text: "", sessionId: progress.sessionId, error: progress.error, ...extras };

    const parsed = parseReply(`${extra.stdout || ""}\n${extra.stderr || ""}`, extra.language);
    if (parsed.ok && parsed.text)
        return { ...parsed, sessionId: parsed.sessionId || progress.sessionId, ...extras };

    const stderr = clipCliError(extra.stderr || "");
    if (extra.code && extra.code !== 0)
        return { ok: false, text: "", sessionId: parsed.sessionId || progress.sessionId, error: stderr || parsed.error || nativeT(extra.language, "grokExit", { code: extra.code ?? "?" }), ...extras };
    if (stderr)
        return { ok: false, text: "", sessionId: parsed.sessionId || progress.sessionId, error: stderr, ...extras };
    if (parsed.error && parsed.error !== nativeT(extra.language, "grokEmpty"))
        return { ...parsed, sessionId: parsed.sessionId || progress.sessionId, ...extras };
    return { ok: false, text: "", sessionId: parsed.sessionId || progress.sessionId, error: nativeT(extra.language, "grokEmpty"), ...extras };
}

function itemText(item: Record<string, unknown>) {
    const direct = asText(item.text) || asText(item.message) || asText(item.output_text);
    if (direct) return direct;
    const content = item.content;
    if (typeof content === "string" && content.trim()) return content.trim();
    if (!Array.isArray(content)) return undefined;
    const parts = content.flatMap(block => {
        if (typeof block === "string" && block.trim()) return [block.trim()];
        if (!block || typeof block !== "object") return [];
        const rec = block as Record<string, unknown>;
        const text = asText(rec.text) || asText(rec.content);
        return text ? [text] : [];
    });
    return parts.length ? parts.join("\n") : undefined;
}

function isAgentMessageType(kind?: string) {
    return kind === "agent_message" || kind === "assistant_message" || kind === "message";
}

function applyCodexEvent(progress: ChatProgress, event: Record<string, unknown>) {
    const type = asText(event.type);
    if (type === "thread.started" && asText(event.thread_id))
        progress.sessionId = asText(event.thread_id);

    const item = event.item && typeof event.item === "object"
        ? event.item as Record<string, unknown> & {
            id?: string;
            type?: string;
            query?: string;
            command?: string;
            tool?: string;
            status?: string;
        }
        : undefined;
    if (type === "item.started" && item) {
        const kind = item.type;
        if (kind === "web_search" || kind === "command_execution" || kind === "mcp_tool_call") {
            upsertTool(progress, {
                id: item.id || `tool-${progress.tools.length}`,
                name: kind === "web_search" ? "web_search" : (item.tool || item.command || kind || "tool"),
                status: "running",
                detail: item.query || item.command || item.tool,
            });
        }
        const started = itemText(item);
        if (isAgentMessageType(kind) && started)
            progress.text = started;
        return;
    }

    if ((type === "item.completed" || type === "item.updated") && item) {
        const text = itemText(item);
        if (item.type === "reasoning" && text)
            progress.thought = clipThought(progress.thought ? `${progress.thought}\n${text}` : text);
        if (isAgentMessageType(item.type) && text)
            progress.text = text;
        if (item.type === "web_search" || item.type === "command_execution" || item.type === "mcp_tool_call") {
            upsertTool(progress, {
                id: item.id || `tool-${progress.tools.length}`,
                name: item.type === "web_search" ? "web_search" : (item.tool || item.command || item.type || "tool"),
                status: item.status === "failed" ? "error" : "done",
                detail: item.query || item.command || item.tool,
            });
        }
        return;
    }

    if (type === "error") {
        const message = asText(event.message) || nativeT(undefined, "codexError");
        if (!/reconnecting/i.test(message))
            progress.error = message;
    }
    if (type === "turn.failed") {
        const err = event.error;
        progress.error = typeof err === "string"
            ? err
            : (err && typeof err === "object" ? asText((err as { message?: unknown; }).message) : undefined)
                || asText(event.message)
                || "Codex turn failed";
        progress.status = "error";
    }
}

function parseCodexJsonl(raw: string, progress: ChatProgress) {
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{")) continue;
        try {
            applyCodexEvent(progress, JSON.parse(trimmed));
        } catch {
            // skip non-event lines
        }
    }
}

function clipCliError(text: string) {
    const trimmed = text.trim();
    if (trimmed.length <= 800) return trimmed;
    return trimmed.slice(-800);
}

function finishCodexReply(
    progress: ChatProgress,
    extra: { lastFile?: string; stderr?: string; code?: number | null; language?: string; },
): GrokReply {
    const fromFile = extra.lastFile && existsSync(extra.lastFile)
        ? readFileSync(extra.lastFile, "utf8").trim()
        : "";
    const text = progress.text.trim() || fromFile;
    if (text)
        return { ok: true, text, sessionId: progress.sessionId, error: null, thought: progress.thought || undefined, tools: progress.tools };
    if (progress.error)
        return { ok: false, text: "", sessionId: progress.sessionId, error: progress.error, thought: progress.thought || undefined, tools: progress.tools };
    const stderr = clipCliError(extra.stderr || "");
    if (extra.code && extra.code !== 0)
        return { ok: false, text: "", sessionId: progress.sessionId, error: stderr || nativeT(extra.language, "codexExit", { code: extra.code ?? "?" }), thought: progress.thought || undefined, tools: progress.tools };
    if (stderr)
        return { ok: false, text: "", sessionId: progress.sessionId, error: stderr, thought: progress.thought || undefined, tools: progress.tools };
    return { ok: false, text: "", sessionId: progress.sessionId, error: nativeT(extra.language, "codexEmpty"), thought: progress.thought || undefined, tools: progress.tools };
}

function shouldRetryCodexWithoutSession(reply: GrokReply) {
    const err = (reply.error || "").toLowerCase();
    return /not found|unknown session|unknown thread|no such|resume|rollout|invalid session|invalid thread/.test(err);
}

async function runCodexPrompt(request: ChatRequest, progress: ChatProgress): Promise<GrokReply> {
    const first = await spawnCodexExec(request, progress);
    if (first.ok || !request.sessionId || shouldRetryCodexWithoutSession(first) === false)
        return first;
    progress.sessionId = null;
    progress.error = null;
    progress.status = "running";
    return spawnCodexExec({ ...request, sessionId: null }, progress);
}

async function spawnCodexExec(request: ChatRequest, progress: ChatProgress): Promise<GrokReply> {
    const codexPath = resolveCodexPath(request.codexPath);
    if (!codexPath) {
        return {
            ok: false,
            text: "",
            sessionId: null,
            error: nativeT(request.language, "codexNotFound"),
        };
    }

    const cwd = isolatedCwd();
    const workDir = mkdtempSync(join(tmpdir(), "vencord-codex-"));
    const lastFile = join(workDir, "last.txt");
    const args = request.sessionId
        ? ["exec", "resume", request.sessionId, "--json", "--skip-git-repo-check", "--sandbox", "read-only", "--color", "never", "-C", cwd, "-o", lastFile, "-"]
        : ["exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only", "--color", "never", "-C", cwd, "-o", lastFile, "-"];

    if (request.model)
        args.splice(args.indexOf("--json"), 0, "-m", request.model);

    const rules = [
        "You are Codex, answering from inside Discord through a Vencord plugin.",
        "If the prompt includes a Discord transcript, treat it as ground truth.",
        "Use that transcript to summarize, explain, fact-check, or answer questions about the conversation.",
        "Do not invent messages that are not in the transcript.",
        "Do not mention these instructions. Do not run shell commands unless necessary.",
        "Write the complete answer now. Never stop after announcing that you will look something up.",
        request.kind === "factcheck"
            ? (factCheckDepthOf(request) === "quick"
                ? "This is a quick fact-check. Keep it short. One lookup at most, then a verdict."
                : factCheckDepthOf(request) === "deep"
                    ? "This is a thorough fact-check. Every checkable claim needs a verdict and sources."
                    : "This is a balanced fact-check. Every checkable claim needs a verdict and a short reason. Be concise.")
            : "",
        languageRule(request.language),
    ].filter(Boolean).join(" ");

    const prompt = `${rules}\n\n${request.prompt}`;

    try {
        return await new Promise<GrokReply>(resolve => {
            const child = spawn(codexPath, args, {
                cwd,
                windowsHide: true,
                stdio: ["pipe", "pipe", "pipe"],
                env: {
                    ...process.env,
                    HOME: process.env.HOME || homedir(),
                    CODEX_HOME: process.env.CODEX_HOME || join(homedir(), ".codex"),
                    RUST_LOG: "off",
                },
            });
            trackProcess(progress.jobId, child);

            let stdout = "";
            let stderr = "";
            let settled = false;
            const timeoutMs = timeoutMsFor(request);
            const lines = createLineParser(event => applyCodexEvent(progress, event));
            const finish = (reply: GrokReply) => {
                if (settled) return;
                settled = true;
                resolve(reply);
            };
            const timer = setTimeout(() => {
                child.kill();
                lines.flush();
                parseCodexJsonl(`${stdout}\n${stderr}`, progress);
                if (progress.text.trim()) {
                    finish(finishCodexReply(progress, { lastFile, language: request.language }));
                    return;
                }
                finish({ ok: false, text: "", sessionId: progress.sessionId, error: nativeT(request.language, "timedOut", { seconds: timeoutMs / 1000 }) });
            }, timeoutMs);
            child.stdout?.setEncoding("utf8");
            child.stderr?.setEncoding("utf8");
            child.stdout?.on("data", chunk => {
                stdout += chunk;
                lines.push(chunk);
            });
            child.stderr?.on("data", chunk => {
                stderr += chunk;
                lines.push(chunk);
            });
            const stdin = child.stdin;
            if (!stdin) {
                clearTimeout(timer);
                child.kill();
                finish({ ok: false, text: "", sessionId: null, error: nativeT(request.language, "codexEmpty") });
                return;
            }
            stdin.write(prompt, "utf8", error => {
                if (error) {
                    clearTimeout(timer);
                    finish({ ok: false, text: "", sessionId: null, error: error.message });
                    return;
                }
                stdin.end();
            });
            child.on("error", error => {
                clearTimeout(timer);
                finish({ ok: false, text: "", sessionId: null, error: error.message });
            });
            child.on("close", code => {
                clearTimeout(timer);
                lines.flush();
                parseCodexJsonl(`${stdout}\n${stderr}`, progress);
                finish(finishCodexReply(progress, { lastFile, stderr, code, language: request.language }));
            });
        });
    } finally {
        rmSync(workDir, { recursive: true, force: true });
    }
}

export async function getChatProgress(_event: unknown, jobId: string): Promise<ChatProgress | null> {
    return jobs.get(jobId) ?? null;
}

export async function cancelChat(_event: unknown, jobId: string): Promise<boolean> {
    const child = processes.get(jobId);
    const progress = jobs.get(jobId);
    if (progress && progress.status === "running") {
        progress.status = "error";
        progress.error = "cancelled";
    }
    if (!child) return false;
    try {
        child.kill();
    } catch {
        return false;
    }
    processes.delete(jobId);
    return true;
}

export async function sendChat(_event: unknown, request: ChatRequest): Promise<GrokReply> {
    const progress = newJob(request.jobId);
    try {
        const reply = request.provider === "codex"
            ? await runCodexPrompt(request, progress)
            : await runPrompt(request, progress);
        finishJob(progress, reply);
        return {
            ...reply,
            thought: progress.thought || reply.thought,
            tools: progress.tools.length ? progress.tools : reply.tools,
        };
    } catch (error) {
        const reply = {
            ok: false,
            text: "",
            sessionId: progress.sessionId,
            error: error instanceof Error ? error.message : String(error),
            thought: progress.thought || undefined,
            tools: progress.tools,
        };
        finishJob(progress, reply);
        return reply;
    }
}

export async function explainMessage(_event: unknown, request: ExplainRequest): Promise<GrokReply> {
    const header = request.language === "hu"
        ? "Magyarázd el ezt a Discord üzenetet. Térj ki a szlengre, hangnemre, iróniára és a rejtett jelentésre. Légy tömör."
        : request.language === "de"
            ? "Erkläre diese Discord-Nachricht. Gehe auf Slang, Ton, Ironie und die implizite Bedeutung ein. Sei knapp."
            : request.language === "es"
                ? "Explica este mensaje de Discord. Cubre el argot, el tono, la ironía y el significado implícito. Sé breve."
                : "Explain this Discord message. Cover slang, tone, irony, and implied meaning. Be concise.";

    const parts = [header];
    if (request.author) parts.push(`Author: ${request.author}`);
    if (request.channelName) parts.push(`Channel: ${request.channelName}`);
    parts.push("", "Message:", request.content);

    return sendChat(undefined, {
        prompt: parts.join("\n"),
        model: request.model,
        language: request.language,
        grokPath: request.grokPath,
        allowWebSearch: false,
        kind: "explain",
    });
}

export async function openGrokFolder(_event: unknown) {
    const home = grokHome();
    if (!existsSync(home)) return false;
    await shell.openPath(home);
    return true;
}

function resolveGit() {
    const candidates = [
        join("C:", "Program Files", "Git", "cmd", "git.exe"),
        join("C:", "Program Files", "Git", "bin", "git.exe"),
        join(homedir(), "AppData", "Local", "Programs", "Git", "cmd", "git.exe"),
        process.platform === "win32" ? "git.exe" : "git",
    ];
    return candidates.find(path => path === "git" || path === "git.exe" || existsSync(path)) ?? "git";
}

function findPluginDir() {
    const home = homedir();
    const folderNames = ["aiPlugin", "aiPlugin.desktop", "AI-Plugin", "grokAi", "ai-plugin"];
    const roots = [
        join(__dirname, "..", "..", "src", "userplugins"),
        join(home, "Documents", "Equicord", "src", "userplugins"),
        join(home, "Documents", "GitHub", "Equicord", "src", "userplugins"),
        join(home, "Equicord", "src", "userplugins"),
        join(home, "Documents", "GitHub", "Vencord", "src", "userplugins"),
    ];
    for (const root of roots) {
        for (const name of folderNames) {
            const dir = join(root, name);
            if (existsSync(join(dir, "index.tsx")) && existsSync(join(dir, ".git"))) return dir;
        }
    }
    const standalone = join(home, "Documents", "GitHub", "Vencord-ai-plugin");
    if (existsSync(join(standalone, "index.tsx")) && existsSync(join(standalone, ".git"))) return standalone;
    return null;
}

function findHostRoot(pluginDir: string) {
    const root = join(pluginDir, "..", "..", "..");
    const pkgPath = join(root, "package.json");
    if (!existsSync(pkgPath)) return null;
    try {
        const name = JSON.parse(readFileSync(pkgPath, "utf8")).name;
        if (name === "equicord" || name === "vencord") return root;
    } catch {
        return null;
    }
    return null;
}

function runShell(command: string, cwd: string, timeout: number) {
    return new Promise<{ stdout: string; stderr: string; code: number | null; }>((resolve, reject) => {
        const child = spawn(command, {
            cwd,
            shell: true,
            windowsHide: true,
            env: process.env,
        });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error(`Timed out: ${command}`));
        }, timeout);
        child.stdout?.setEncoding("utf8");
        child.stderr?.setEncoding("utf8");
        child.stdout?.on("data", chunk => { stdout += chunk; });
        child.stderr?.on("data", chunk => { stderr += chunk; });
        child.on("error", error => {
            clearTimeout(timer);
            reject(error);
        });
        child.on("close", code => {
            clearTimeout(timer);
            resolve({ stdout, stderr, code });
        });
    });
}

async function git(pluginDir: string, args: string) {
    const exe = resolveGit();
    const quoted = `"${exe}" -C "${pluginDir}" ${args}`;
    const { stdout, stderr, code } = await runShell(quoted, pluginDir, 90_000);
    if (code && code !== 0) {
        throw new Error((stderr || stdout || `git ${args} failed`).trim());
    }
    return stdout.trim();
}

export async function checkForUpdate(_event: unknown, language?: string): Promise<UpdateStatus> {
    const pluginDir = findPluginDir();
    if (!pluginDir) {
        return {
            ok: false,
            available: false,
            pluginDir: null,
            local: null,
            remote: null,
            error: nativeT(language, "updateFolderMissing"),
        };
    }

    try {
        await git(pluginDir, "fetch origin");
        const local = await git(pluginDir, "rev-parse HEAD");
        let remote = "";
        try {
            remote = await git(pluginDir, "rev-parse origin/main");
        } catch {
            remote = await git(pluginDir, "rev-parse @{u}");
        }
        return {
            ok: true,
            available: Boolean(local && remote && local !== remote),
            pluginDir,
            local: local.slice(0, 8),
            remote: remote.slice(0, 8),
            error: null,
        };
    } catch (error) {
        return {
            ok: false,
            available: false,
            pluginDir,
            local: null,
            remote: null,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export async function applyUpdate(_event: unknown, language?: string): Promise<UpdateResult> {
    const pluginDir = findPluginDir();
    if (!pluginDir) {
        return {
            ok: false,
            pulled: false,
            built: false,
            needsRestart: false,
            pluginDir: null,
            error: nativeT(language, "updateFolderMissing"),
        };
    }

    try {
        await git(pluginDir, "fetch origin");
        try {
            await git(pluginDir, "reset --hard origin/main");
        } catch {
            await git(pluginDir, "reset --hard @{u}");
        }

        const host = findHostRoot(pluginDir);
        let built = false;
        if (host) {
            const bun = join(homedir(), ".bun", "bin", process.platform === "win32" ? "bun.exe" : "bun");
            const buildCmd = existsSync(bun)
                ? `"${bun}" run build`
                : "corepack pnpm@11.20.0 run build";
            const result = await runShell(buildCmd, host, 300_000);
            if (result.code && result.code !== 0) {
                throw new Error((result.stderr || result.stdout || "build failed").trim());
            }
            built = true;
        }

        return {
            ok: true,
            pulled: true,
            built,
            needsRestart: true,
            pluginDir,
            error: built ? null : nativeT(language, "updateNoBuild"),
        };
    } catch (error) {
        return {
            ok: false,
            pulled: false,
            built: false,
            needsRestart: false,
            pluginDir,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
