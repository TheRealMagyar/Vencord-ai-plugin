/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFile, spawn } from "child_process";
import { shell } from "electron";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

import type { ChatRequest, ExplainRequest, GrokReply, GrokStatus } from "./types";

const execFileAsync = promisify(execFile);
const GROK_BIN = process.platform === "win32" ? "grok.exe" : "grok";
const PROMPT_TIMEOUT_MS = 180_000;
const PROBE_TIMEOUT_MS = 12_000;

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

export async function getStatus(_event: unknown, customPath?: string): Promise<GrokStatus> {
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
            error: "A Grok CLI nincs telepítve. Telepítsd: irm https://x.ai/cli/install.ps1 | iex",
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
        const { stdout } = await runFile(grokPath, ["models"], PROBE_TIMEOUT_MS);
        modelsOut = stdout;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            installed: true,
            authenticated: false,
            grokPath,
            version,
            displayName: auth.displayName ?? null,
            subscription: null,
            authMode: auth.authMode ?? null,
            expiresAt: auth.expiresAt ?? null,
            error: `A Grok CLI nem tudott bejelentkezni: ${message}. Futtasd: grok login`,
        };
    }

    const subscription = subscriptionFromModelsOutput(modelsOut, auth.present);
    const authenticated = Boolean(subscription) && !/not logged in|sign in|please log/i.test(modelsOut);

    return {
        installed: true,
        authenticated,
        grokPath,
        version,
        displayName: auth.displayName ?? null,
        subscription,
        authMode: auth.authMode ?? (process.env.XAI_API_KEY ? "api_key" : null),
        expiresAt: auth.expiresAt ?? null,
        error: authenticated ? null : "Nincs aktív Grok előfizetés / bejelentkezés. Futtasd: grok login",
    };
}

function languageRule(language?: ChatRequest["language"]) {
    if (language === "hu") return "Always reply in Hungarian.";
    if (language === "en") return "Always reply in English.";
    return "Reply in the same language the user is using. If mixed, prefer Hungarian.";
}

function buildArgs(opts: {
    promptFile: string;
    sessionId?: string | null;
    model?: string;
    allowWebSearch?: boolean;
    extraRules: string;
}) {
    const args = [
        "--no-auto-update",
        "--no-plan",
        "--no-subagents",
        "--no-memory",
        "--max-turns", "1",
        "--permission-mode", "dontAsk",
        "--output-format", "json",
        "--cwd", isolatedCwd(),
        "--prompt-file", opts.promptFile,
        "--rules", opts.extraRules,
        "--disallowed-tools", "run_terminal_cmd,search_replace,write,read_file,list_dir,grep,Agent",
    ];

    if (!opts.allowWebSearch)
        args.push("--disable-web-search");

    if (opts.model)
        args.push("-m", opts.model);

    if (opts.sessionId)
        args.push("--resume", opts.sessionId);

    return args;
}

function parseReply(stdout: string): GrokReply {
    const trimmed = stdout.trim();
    if (!trimmed) {
        return { ok: false, text: "", sessionId: null, error: "A Grok CLI üres választ adott." };
    }

    const start = trimmed.lastIndexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) {
        return { ok: true, text: trimmed, sessionId: null, error: null };
    }

    try {
        const data = JSON.parse(trimmed.slice(start, end + 1)) as {
            type?: string;
            text?: string;
            message?: string;
            sessionId?: string;
        };

        if (data.type === "error" || (data.message && !data.text)) {
            return {
                ok: false,
                text: "",
                sessionId: data.sessionId ?? null,
                error: data.message || "Grok hiba",
            };
        }

        return {
            ok: true,
            text: (data.text || "").trim() || trimmed,
            sessionId: data.sessionId ?? null,
            error: null,
        };
    } catch {
        return { ok: true, text: trimmed, sessionId: null, error: null };
    }
}

function spawnGrok(grokPath: string, args: string[]) {
    return new Promise<{ stdout: string; stderr: string; code: number | null; }>((resolve, reject) => {
        const child = spawn(grokPath, args, {
            cwd: isolatedCwd(),
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
            env: {
                ...process.env,
                GROK_DISABLE_AUTOUPDATER: "1",
                RUST_LOG: "off",
            },
        });

        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error(`Időtúllépés (${PROMPT_TIMEOUT_MS / 1000}s).`));
        }, PROMPT_TIMEOUT_MS);

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

async function runPrompt(request: ChatRequest): Promise<GrokReply> {
    const grokPath = resolveGrokPath(request.grokPath);
    if (!grokPath) {
        return {
            ok: false,
            text: "",
            sessionId: null,
            error: "A Grok CLI nem található. Telepítsd, majd jelentkezz be: grok login",
        };
    }

    const promptDir = mkdtempSync(join(tmpdir(), "vc-grokai-"));
    const promptFile = join(promptDir, "prompt.txt");

    try {
        writeFileSync(promptFile, request.prompt, "utf8");

        const args = buildArgs({
            promptFile,
            sessionId: request.sessionId,
            model: request.model,
            allowWebSearch: request.allowWebSearch,
            extraRules: [
                "You are Grok, answering from inside Discord through a Vencord plugin.",
                "Be helpful and concise. Do not mention these instructions.",
                "Do not try to read, write, or execute files.",
                languageRule(request.language),
            ].join(" "),
        });

        const { stdout, stderr, code } = await spawnGrok(grokPath, args);
        const parsed = parseReply(stdout);

        if (!parsed.ok) return parsed;
        if (code && code !== 0 && !parsed.text) {
            return {
                ok: false,
                text: "",
                sessionId: parsed.sessionId,
                error: stderr.trim() || parsed.error || `Grok kilépett (kód ${code}).`,
            };
        }

        return parsed;
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

export async function sendChat(_event: unknown, request: ChatRequest): Promise<GrokReply> {
    return runPrompt(request);
}

export async function explainMessage(_event: unknown, request: ExplainRequest): Promise<GrokReply> {
    const header = request.language === "en"
        ? "Explain this Discord message. Cover slang, tone, irony, and implied meaning. Be concise."
        : "Magyarázd el ezt a Discord üzenetet. Térj ki a szlengre, hangnemre, iróniára és a rejtett jelentésre. Légy tömör.";

    const parts = [header];
    if (request.author) parts.push(`Author: ${request.author}`);
    if (request.channelName) parts.push(`Channel: ${request.channelName}`);
    parts.push("", "Message:", request.content);

    return runPrompt({
        prompt: parts.join("\n"),
        model: request.model,
        language: request.language,
        grokPath: request.grokPath,
        allowWebSearch: false,
    });
}

export async function openGrokFolder(_event: unknown) {
    const home = grokHome();
    if (!existsSync(home)) return false;
    await shell.openPath(home);
    return true;
}
