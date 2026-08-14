/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { copyWithToast, insertTextIntoChatInputBox } from "@utils/discord";
import { Message, RenderModalProps } from "@vencord/discord-types";
import { ChannelStore, Modal, openModal, Parser, SelectedChannelStore, useEffect, useRef, useState } from "@webpack/common";

import { packChannelContext, withTranscript } from "./channelContext";
import { GrokIcon } from "./GrokIcon";
import { clearThread, getThreadTitle, loadThread, persistableMessages, saveThread } from "./history";
import { settings } from "./settings";
import type { ChatMessage, ChatToolStep, GrokStatus } from "./types";
import { resolveLang } from "./i18n";
import { cl, getMessageContent, getNative, t } from "./utils";

interface OpenOptions {
    seedPrompt?: string;
    explainMessage?: Message;
    factCheckMessage?: Message;
    channelId?: string;
}

type MessageActionKind = "explain" | "factcheck";

function nextId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function unwrapReplyText(text: string) {
    const trimmed = text.trim();
    if (!trimmed.startsWith("{")) return text;
    try {
        const data = JSON.parse(trimmed) as { text?: unknown; };
        if (typeof data.text === "string" && data.text.trim()) return data.text.trim();
    } catch {
        // keep original
    }
    return text;
}

function renderMarkdown(text: string) {
    try {
        return Parser.parse(text, true, { allowHeading: true, allowLinks: true, allowList: true });
    } catch {
        return text;
    }
}

function toolLabel(step: ChatToolStep) {
    const name = (step.name || "").toLowerCase();
    if (name.includes("search") || name === "web_search")
        return step.detail ? `${t("toolSearch")}: ${step.detail}` : t("toolSearch");
    if (name.includes("fetch") || name === "web_fetch")
        return step.detail ? `${t("toolFetch")}: ${step.detail}` : t("toolFetch");
    const base = t("toolRunning", { name: step.name || "tool" });
    return step.detail ? `${base}: ${step.detail}` : base;
}

function formatTime(at?: number) {
    if (!at) return "";
    try {
        return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
        return "";
    }
}

function resolveChannelId(options?: OpenOptions) {
    return options?.channelId
        || options?.explainMessage?.channel_id
        || options?.factCheckMessage?.channel_id
        || SelectedChannelStore.getChannelId()
        || "";
}

function resolveMessageAction(options?: OpenOptions): { kind: MessageActionKind; message: Message; } | null {
    if (options?.explainMessage) return { kind: "explain", message: options.explainMessage };
    if (options?.factCheckMessage) return { kind: "factcheck", message: options.factCheckMessage };
    return null;
}

function GrokModal({ rootProps, options }: { rootProps: RenderModalProps; options?: OpenOptions; }) {
    const { language, grokModel, codexModel, allowWebSearch, grokPath, includeChannelContext, provider, codexPath, showThinking } = settings.use(["language", "grokModel", "codexModel", "allowWebSearch", "grokPath", "includeChannelContext", "provider", "codexPath", "showThinking"]);
    const [status, setStatus] = useState<GrokStatus | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const sessionsRef = useRef<Partial<Record<"grok" | "codex", string | null>>>({});
    const [channelId, setChannelId] = useState("");
    const [threadTitle, setThreadTitle] = useState("Grok");
    const scroller = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const busyRef = useRef(false);
    const stickToBottom = useRef(true);
    const started = useRef(false);
    const messagesRef = useRef<ChatMessage[]>([]);
    const Native = getNative();

    const lang = resolveLang(language);
    const activeProvider = (provider === "codex" ? "codex" : "grok") as "grok" | "codex";
    const providerLabel = activeProvider === "codex" ? "Codex" : "Grok";
    const selectedModel = activeProvider === "codex"
        ? (codexModel && codexModel !== "default" ? codexModel : undefined)
        : grokModel;

    useEffect(() => {
        if (!stickToBottom.current) return;
        const el = scroller.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages, busy]);

    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = "0px";
        el.style.height = `${Math.min(Math.max(el.scrollHeight, 40), 140)}px`;
    }, [input]);

    useEffect(() => {
        const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (started.current) return;
        started.current = true;

        (async () => {
            const id = resolveChannelId(options);
            const title = getThreadTitle(id);
            setChannelId(id);
            setThreadTitle(title);

            if (id) {
                const stored = await loadThread(id);
                if (stored) {
                    messagesRef.current = stored.messages;
                    setMessages(stored.messages);
                    sessionsRef.current = stored.sessions ?? { grok: stored.sessionId };
                    setSessionId(sessionsRef.current[activeProvider] ?? (activeProvider === "grok" ? stored.sessionId : null));
                }
            }

            if (!Native) {
                setStatus({
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
                return;
            }

            const next = await Native.getStatus(activeProvider, (activeProvider === "codex" ? codexPath : grokPath) || undefined);
            setStatus(next);

            if (!next.authenticated) return;

            const action = resolveMessageAction(options);
            if (action) {
                const { kind, message } = action;
                const content = getMessageContent(message);
                const author = message.author?.username;
                const channel = ChannelStore.getChannel(message.channel_id);
                const visibleKey = kind === "explain" ? "explainVisible" : "factCheckVisible";
                const promptKey = kind === "explain" ? "explainPrompt" : "factCheckPrompt";
                await ask({
                    kind,
                    visible: t(visibleKey, {
                        author: author ? ` (@${author})` : "",
                        content,
                    }),
                    request: async jobId => {
                        const packed = await packChannelContext({
                            channelId: id,
                            prompt: content,
                            aroundId: message.id,
                            highlightId: message.id,
                            enabled: includeChannelContext,
                        });
                        const userPrompt = t(promptKey, {
                            author: author || "?",
                            channel: channel?.name || title,
                            content,
                        });
                        return Native.sendChat({
                            prompt: withTranscript(userPrompt, packed, kind),
                            sessionId: null,
                            model: selectedModel,
                            language: lang,
                            allowWebSearch: kind === "factcheck" || allowWebSearch,
                            grokPath: grokPath || undefined,
                            provider: activeProvider,
                            codexPath: codexPath || undefined,
                            kind,
                            jobId,
                        });
                    },
                    context: { channelId: id, title },
                });
                return;
            }

            if (options?.seedPrompt) {
                setInput(options.seedPrompt);
            }
        })();
    }, []);

    async function persist(nextMessages: ChatMessage[], nextSession: string | null, id = channelId, title = threadTitle) {
        if (!id) return;
        sessionsRef.current = { ...sessionsRef.current, [activeProvider]: nextSession };
        await saveThread({
            channelId: id,
            title,
            sessionId: sessionsRef.current.grok ?? nextSession,
            sessions: sessionsRef.current,
            messages: persistableMessages(nextMessages),
            updatedAt: Date.now(),
        });
    }

    function patchMessage(id: string, patch: Partial<ChatMessage>) {
        const next = messagesRef.current.map(msg => msg.id === id ? { ...msg, ...patch } : msg);
        messagesRef.current = next;
        setMessages(next);
    }

    async function ask(opts: {
        kind: "chat" | "explain" | "factcheck";
        visible: string;
        request: (jobId: string) => Promise<{
            ok: boolean;
            text: string;
            sessionId: string | null;
            error: string | null;
            thought?: string;
            tools?: ChatToolStep[];
        }>;
        context?: { channelId: string; title: string; };
    }) {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(true);

        const ctxId = opts.context?.channelId || channelId;
        const ctxTitle = opts.context?.title || threadTitle;
        const jobId = nextId();
        const userMsg: ChatMessage = { id: nextId(), role: "user", text: opts.visible, at: Date.now() };
        const pending: ChatMessage = {
            id: nextId(),
            role: "assistant",
            text: "",
            pending: true,
            thought: "",
            tools: [],
        };
        const withPending = [...messagesRef.current, userMsg, pending];
        messagesRef.current = withPending;
        setMessages(withPending);

        const poll = showThinking && Native?.getChatProgress
            ? window.setInterval(async () => {
                try {
                    const live = await Native.getChatProgress(jobId);
                    if (!live) return;
                    patchMessage(pending.id, {
                        thought: live.thought,
                        tools: live.tools,
                        text: live.text,
                    });
                } catch {
                    // ignore poll errors
                }
            }, 220)
            : 0;

        try {
            const reply = await opts.request(jobId);
            const nextSession = reply.sessionId || sessionId;
            if (reply.sessionId) setSessionId(reply.sessionId);

            patchMessage(pending.id, {
                pending: false,
                error: !reply.ok,
                at: Date.now(),
                thought: reply.thought || "",
                tools: reply.tools || [],
                text: reply.ok
                    ? unwrapReplyText(reply.text)
                    : (reply.error || t("unknownError")),
            });
            await persist(messagesRef.current, nextSession, ctxId, ctxTitle);
        } catch (error) {
            patchMessage(pending.id, {
                pending: false,
                error: true,
                at: Date.now(),
                text: error instanceof Error ? error.message : String(error),
            });
            await persist(messagesRef.current, sessionId, ctxId, ctxTitle);
        } finally {
            if (poll) window.clearInterval(poll);
            busyRef.current = false;
            setBusy(false);
            window.setTimeout(() => inputRef.current?.focus(), 0);
        }
    }

    async function onSend() {
        const prompt = input.trim();
        if (!prompt || !Native || busyRef.current) return;
        setInput("");

        await ask({
            kind: "chat",
            visible: prompt,
            request: async jobId => {
                const packed = await packChannelContext({
                    channelId,
                    prompt,
                    enabled: includeChannelContext,
                });
                return Native.sendChat({
                    prompt: withTranscript(prompt, packed, "chat"),
                    sessionId,
                    model: selectedModel,
                    language: lang,
                    allowWebSearch,
                    grokPath: grokPath || undefined,
                    provider: activeProvider,
                    codexPath: codexPath || undefined,
                    kind: "chat",
                    jobId,
                });
            },
        });
    }

    async function onClear() {
        if (!channelId) {
            messagesRef.current = [];
            setMessages([]);
            setSessionId(null);
            return;
        }
        await clearThread(channelId);
        messagesRef.current = [];
        sessionsRef.current = {};
        setMessages([]);
        setSessionId(null);
    }

    const connected = Boolean(status?.installed && status.authenticated);
    const title = `${providerLabel} · ${threadTitle}`;

    return (
        <Modal
            {...rootProps}
            size="lg"
            title={title}
            subtitle={
                <span className={cl("status")}>
                    <span className={cl("dot", { ok: connected })} />
                    {connected
                        ? `${providerLabel} · ${status?.subscription || t("connected")}`
                        : (status?.error || t("connecting"))}
                </span>
            }
            listProps={{ className: cl("modal-scroller"), style: { overflow: "hidden" } }}
        >
            <div
                className={cl("root")}
                onWheel={e => {
                    e.stopPropagation();
                    const box = scroller.current;
                    if (box && box.contains(e.target as Node)) {
                        const atTop = box.scrollTop <= 0 && e.deltaY < 0;
                        const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight <= 1 && e.deltaY > 0;
                        if (atTop || atBottom) e.preventDefault();
                        return;
                    }
                    e.preventDefault();
                }}
            >
                <div className={cl("toolbar")}>
                    <span className={cl("toolbar-label")}>
                        {t("historyLabel")} {threadTitle}
                        {messages.length ? ` · ${messages.filter(m => !m.pending).length}` : ""}
                    </span>
                    <div className={cl("toolbar-actions")}>
                        <button
                            className={cl("mini", { on: showThinking })}
                            onClick={() => { settings.store.showThinking = !showThinking; }}
                        >
                            {t("thinkingToggle")}
                        </button>
                        <button className={cl("mini")} disabled={!messages.length} onClick={onClear}>
                            {t("clearHistory")}
                        </button>
                    </div>
                </div>

                <div
                    className={cl("messages")}
                    ref={scroller}
                    onScroll={() => {
                        const el = scroller.current;
                        if (!el) return;
                        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
                    }}
                >
                    {messages.length === 0 && (
                        <div className={cl("empty")}>
                            <div className={cl("empty-icon")}>
                                <GrokIcon height={32} width={32} />
                            </div>
                            <strong>{t("hello", { provider: providerLabel })}</strong>
                            <div>
                                {t("helloHint", { title: threadTitle })}
                            </div>
                        </div>
                    )}

                    {messages.map(msg => {
                        const tools = showThinking ? (msg.tools ?? []) : [];
                        const thought = showThinking ? (msg.thought ?? "") : "";
                        const showTrace = msg.role === "assistant" && (thought.trim() || tools.length);
                        const answer = msg.pending && !msg.text.trim()
                            ? t("thinking", { provider: providerLabel })
                            : msg.text;
                        return (
                            <div key={msg.id} className={cl("row", msg.role)}>
                                <div className={cl("meta")}>
                                    {msg.role === "user" ? t("you") : providerLabel}
                                    {msg.at ? ` · ${formatTime(msg.at)}` : ""}
                                </div>
                                {showTrace && (
                                    <details className={cl("trace", { live: Boolean(msg.pending) })} open={Boolean(msg.pending)}>
                                        <summary>{t("thinkingLabel")}</summary>
                                        {tools.map(step => (
                                            <div key={step.id} className={cl("tool", step.status)}>
                                                <span className={cl("tool-dot")} />
                                                {toolLabel(step)}
                                            </div>
                                        ))}
                                        {thought.trim() && (
                                            <div className={cl("thought")}>{thought.trim()}</div>
                                        )}
                                    </details>
                                )}
                                <div className={cl("bubble", msg.role, { pending: Boolean(msg.pending), error: Boolean(msg.error) })}>
                                    {msg.role === "assistant" && (!msg.pending || msg.text.trim())
                                        ? renderMarkdown(answer)
                                        : answer}
                                </div>
                                {msg.role === "assistant" && !msg.pending && (
                                    <div className={cl("actions")}>
                                        <button className={cl("mini")} onClick={() => copyWithToast(msg.text)}>
                                            {t("copy")}
                                        </button>
                                        <button
                                            className={cl("mini")}
                                            onClick={() => insertTextIntoChatInputBox(msg.text)}
                                        >
                                            {t("insertChat")}
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className={cl("composer", { disabled: busy || !connected })}>
                    <textarea
                        ref={inputRef}
                        className={cl("input")}
                        rows={1}
                        value={input}
                        disabled={busy || !connected}
                        placeholder={t("placeholder", { provider: providerLabel })}
                        onChange={e => setInput(e.currentTarget.value)}
                        onKeyDown={e => {
                            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229)
                                return;
                            e.preventDefault();
                            onSend();
                        }}
                    />
                    <button className={cl("send")} disabled={busy || !connected || !input.trim()} onClick={onSend}>
                        {busy ? t("wait") : t("send")}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

export function openGrokModal(options?: OpenOptions) {
    openModal(props => <GrokModal rootProps={props} options={options} />);
}
