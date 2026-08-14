/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFile, spawn } from "child_process";
import { shell } from "electron";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

import type { AiProvider, ChatRequest, ExplainRequest, GrokReply, GrokStatus, UpdateResult, UpdateStatus } from "./types";

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

async function getCodexStatus(customPath?: string): Promise<GrokStatus> {
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
            error: "A Codex CLI nincs telepítve. Telepítsd a ChatGPT / Codex asztali appot, vagy: npm i -g @openai/codex",
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
        error: authenticated ? null : "Nincs aktív Codex / ChatGPT bejelentkezés. Futtasd: codex login",
    };
}

export async function getStatus(_event: unknown, providerOrPath?: string, maybePath?: string): Promise<GrokStatus> {
    const provider: AiProvider = providerOrPath === "codex" ? "codex" : "grok";
    const customPath = providerOrPath === "codex" || providerOrPath === "grok" ? maybePath : providerOrPath;
    if (provider === "codex") return getCodexStatus(customPath);

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
                error: `A Grok CLI nem tudott bejelentkezni: ${err.message ?? "unknown"}. Futtasd: grok login`,
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
        error: authenticated ? null : "Nincs aktív Grok előfizetés / bejelentkezés. Futtasd: grok login",
    };
}

function languageRule(language?: ChatRequest["language"]) {
    if (language === "hu") return "Always reply in Hungarian.";
    if (language === "de") return "Always reply in German.";
    if (language === "es") return "Always reply in Spanish.";
    return "Always reply in English.";
}

function wantsWebTools(request: ChatRequest) {
    return request.kind === "factcheck" || Boolean(request.allowWebSearch);
}

function maxTurnsFor(request: ChatRequest) {
    if (request.kind === "factcheck") return 12;
    if (wantsWebTools(request)) return 8;
    return 4;
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

    if (wantsWebTools(request)) {
        parts.push(
            "You have web_search and web_fetch. Use them when current facts, dates, quotes, or news matter.",
            "After tool results arrive, write the complete answer in the same session.",
            "Never stop after announcing that you will look something up.",
        );
    }

    if (request.kind === "factcheck") {
        parts.push(
            "This is a fact-check. Call web_search (and web_fetch if needed), then output the full verdicts.",
            "Every checkable claim needs True / Mostly true / Mixed / Mostly false / False / Unverifiable, a short reason, and sources.",
        );
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
        "--no-auto-update",
        "--no-plan",
        "--no-subagents",
        "--no-memory",
        "--max-turns", String(opts.maxTurns),
        "--output-format", "json",
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
    for (const key of ["text", "result", "output_text", "message", "content"] as const) {
        const direct = stringField(data[key]);
        if (direct) return direct;
        const nested = data[key];
        if (nested && typeof nested === "object") {
            const inner = stringField((nested as { text?: unknown; }).text)
                || stringField((nested as { content?: unknown; }).content);
            if (inner) return inner;
        }
    }

    const messages = data.messages;
    if (Array.isArray(messages)) {
        for (let i = messages.length - 1; i >= 0; i--) {
            const item = messages[i];
            if (!item || typeof item !== "object") continue;
            const rec = item as Record<string, unknown>;
            const text = stringField(rec.text) || stringField(rec.content) || stringField(rec.result);
            if (text) return text;
        }
    }

    return null;
}

function sessionIdFrom(data: Record<string, unknown>) {
    return stringField(data.sessionId) || stringField(data.session_id);
}

function parseReply(stdout: string): GrokReply {
    const trimmed = stdout.trim();
    if (!trimmed) {
        return { ok: false, text: "", sessionId: null, error: "A Grok CLI üres választ adott." };
    }

    const objects = extractJsonObjects(trimmed);
    if (!objects.length) {
        return { ok: true, text: trimmed, sessionId: null, error: null };
    }

    const lastError = [...objects].reverse().find(data => data.type === "error");
    let sessionId: string | null = null;
    for (const data of objects)
        sessionId = sessionIdFrom(data) || sessionId;

    for (let i = objects.length - 1; i >= 0; i--) {
        const data = objects[i];
        if (data.type === "error") continue;
        const text = textFromPayload(data);
        if (text)
            return { ok: true, text, sessionId: sessionIdFrom(data) || sessionId, error: null };
    }

    return {
        ok: false,
        text: "",
        sessionId,
        error: lastError
            ? (stringField(lastError.message) || "Grok hiba")
            : "A Grok válaszából nem sikerült szöveget kiolvasni.",
    };
}

function spawnGrok(grokPath: string, args: string[], allowWebSearch: boolean) {
    return new Promise<{ stdout: string; stderr: string; code: number | null; }>((resolve, reject) => {
        const child = spawn(grokPath, args, {
            cwd: isolatedCwd(),
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
            env: {
                ...process.env,
                GROK_DISABLE_AUTOUPDATER: "1",
                GROK_WEB_FETCH: allowWebSearch ? "1" : "0",
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

        const allowWebSearch = wantsWebTools(request);
        const args = buildArgs({
            promptFile,
            sessionId: request.sessionId,
            model: request.model,
            allowWebSearch,
            extraRules: extraRulesFor(request),
            maxTurns: maxTurnsFor(request),
        });

        const { stdout, stderr, code } = await spawnGrok(grokPath, args, allowWebSearch);
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

function parseCodexJsonl(stdout: string): GrokReply {
    let sessionId: string | null = null;
    let text = "";
    let error: string | null = null;

    for (const line of stdout.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{")) continue;
        try {
            const event = JSON.parse(trimmed) as {
                type?: string;
                thread_id?: string;
                message?: string;
                error?: { message?: string; } | string;
                item?: { type?: string; text?: string; };
            };
            if (event.type === "thread.started" && event.thread_id)
                sessionId = event.thread_id;
            if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text)
                text = event.item.text;
            if (event.type === "error")
                error = event.message || "Codex hiba";
            if (event.type === "turn.failed") {
                error = typeof event.error === "string"
                    ? event.error
                    : event.error?.message || event.message || "Codex turn failed";
            }
        } catch {
            // skip non-event lines
        }
    }

    if (text.trim())
        return { ok: true, text: text.trim(), sessionId, error: null };
    if (error)
        return { ok: false, text: "", sessionId, error };
    const fallback = stdout.trim();
    return fallback
        ? { ok: true, text: fallback, sessionId, error: null }
        : { ok: false, text: "", sessionId, error: "A Codex CLI üres választ adott." };
}

async function runCodexPrompt(request: ChatRequest): Promise<GrokReply> {
    const codexPath = resolveCodexPath(request.codexPath);
    if (!codexPath) {
        return {
            ok: false,
            text: "",
            sessionId: null,
            error: "A Codex CLI nem található. Jelentkezz be: codex login",
        };
    }

    const cwd = isolatedCwd();
    const args = request.sessionId
        ? ["exec", "resume", request.sessionId, "--json", "--skip-git-repo-check", "--sandbox", "read-only", "--color", "never", "-C", cwd, "-"]
        : ["exec", "--json", "--skip-git-repo-check", "--sandbox", "read-only", "--color", "never", "-C", cwd, "-"];

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
            ? "This is a fact-check. Every checkable claim needs a verdict (True / Mostly true / Mixed / Mostly false / False / Unverifiable) and a short reason."
            : "",
        languageRule(request.language),
    ].filter(Boolean).join(" ");

    const prompt = `${rules}\n\n${request.prompt}`;

    return new Promise(resolve => {
        const child = spawn(codexPath, args, {
            cwd,
            windowsHide: true,
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                RUST_LOG: "off",
            },
        });

        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
            child.kill();
            resolve({ ok: false, text: "", sessionId: null, error: `Időtúllépés (${PROMPT_TIMEOUT_MS / 1000}s).` });
        }, PROMPT_TIMEOUT_MS);

        child.stdout?.setEncoding("utf8");
        child.stderr?.setEncoding("utf8");
        child.stdout?.on("data", chunk => { stdout += chunk; });
        child.stderr?.on("data", chunk => { stderr += chunk; });
        child.stdin?.write(prompt);
        child.stdin?.end();
        child.on("error", error => {
            clearTimeout(timer);
            resolve({ ok: false, text: "", sessionId: null, error: error.message });
        });
        child.on("close", code => {
            clearTimeout(timer);
            const parsed = parseCodexJsonl(stdout);
            if (!parsed.ok && code && code !== 0 && !parsed.error)
                parsed.error = stderr.trim() || `Codex kilépett (kód ${code}).`;
            resolve(parsed);
        });
    });
}

export async function sendChat(_event: unknown, request: ChatRequest): Promise<GrokReply> {
    if (request.provider === "codex") return runCodexPrompt(request);
    return runPrompt(request);
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
    const folderNames = ["AI-Plugin", "grokAi", "ai-plugin"];
    const roots = [
        join(__dirname, "..", "..", "src", "userplugins"),
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
            reject(new Error(`Időtúllépés: ${command}`));
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

export async function checkForUpdate(_event: unknown): Promise<UpdateStatus> {
    const pluginDir = findPluginDir();
    if (!pluginDir) {
        return {
            ok: false,
            available: false,
            pluginDir: null,
            local: null,
            remote: null,
            error: "Nem találom az AI-Plugin git mappát (src/userplugins/AI-Plugin vagy grokAi).",
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

export async function applyUpdate(_event: unknown): Promise<UpdateResult> {
    const pluginDir = findPluginDir();
    if (!pluginDir) {
        return {
            ok: false,
            pulled: false,
            built: false,
            needsRestart: false,
            pluginDir: null,
            error: "Nem találom a GrokAi git mappát.",
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
            error: built ? null : "A forrást frissítettem, de az Equicord/Vencord buildet nem találtam. Futtasd a build parancsot.",
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
