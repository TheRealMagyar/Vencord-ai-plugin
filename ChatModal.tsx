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
import { clearThread, getThreadTitle, loadThread } from "./history";
import { cancelLiveJob, getLiveJob, isChannelBusy, mergeLiveMessages, runLiveChat, subscribeLiveJob } from "./liveChat";
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
    const { language, grokModel, codexModel, allowWebSearch, grokPath, includeChannelContext, provider, codexPath, showThinking, factCheckDepth } = settings.use(["language", "grokModel", "codexModel", "allowWebSearch", "grokPath", "includeChannelContext", "provider", "codexPath", "showThinking", "factCheckDepth"]);
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
    const stickToBottom = useRef(true);
    const started = useRef(false);
    const storedRef = useRef<ChatMessage[]>([]);
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
                    storedRef.current = stored.messages;
                    sessionsRef.current = stored.sessions ?? { grok: stored.sessionId };
                    setSessionId(sessionsRef.current[activeProvider] ?? (activeProvider === "grok" ? stored.sessionId : null));
                }
            }
            applyLiveView(id, storedRef.current);

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
            if (action && isChannelBusy(id)) {
                return;
            }
            if (action) {
                const { kind, message } = action;
                const content = getMessageContent(message);
                const author = message.author?.username;
                const channel = ChannelStore.getChannel(message.channel_id);
                const visibleKey = kind === "explain" ? "explainVisible" : "factCheckVisible";
                const promptKey = kind === "explain"
                    ? "explainPrompt"
                    : factCheckDepth === "quick"
                        ? "factCheckPromptQuick"
                        : factCheckDepth === "deep"
                            ? "factCheckPromptDeep"
                            : "factCheckPrompt";
                const contextMax = kind === "factcheck"
                    ? (factCheckDepth === "quick" ? 16 : factCheckDepth === "deep" ? 80 : 32)
                    : undefined;
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
                            max: contextMax,
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
                            factCheckDepth: kind === "factcheck" ? factCheckDepth : undefined,
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

    function applyLiveView(id = channelId, stored = storedRef.current) {
        const live = getLiveJob(id);
        setBusy(Boolean(live));
        if (live?.sessionId) setSessionId(live.sessionId);
        setMessages(mergeLiveMessages(stored, live));
    }

    useEffect(() => {
        return subscribeLiveJob(channelId, () => {
            if (getLiveJob(channelId)) {
                applyLiveView(channelId, storedRef.current);
                return;
            }
            if (!channelId) {
                applyLiveView(channelId, storedRef.current);
                return;
            }
            void loadThread(channelId).then(stored => {
                storedRef.current = stored?.messages ?? [];
                if (stored?.sessions) sessionsRef.current = stored.sessions;
                const nextSession = stored?.sessions?.[activeProvider] ?? stored?.sessionId ?? null;
                if (nextSession) setSessionId(nextSession);
                applyLiveView(channelId, storedRef.current);
            });
        });
    }, [channelId]);

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
        const ctxId = opts.context?.channelId || channelId;
        const ctxTitle = opts.context?.title || threadTitle;
        if (!Native || isChannelBusy(ctxId)) return;

        await runLiveChat({
            channelId: ctxId,
            title: ctxTitle,
            provider: activeProvider,
            sessionId,
            visible: opts.visible,
            request: opts.request,
        });

        if (ctxId) {
            const stored = await loadThread(ctxId);
            storedRef.current = stored?.messages ?? [];
            if (stored?.sessions) sessionsRef.current = stored.sessions;
            if (stored?.sessions?.[activeProvider] ?? stored?.sessionId)
                setSessionId(stored?.sessions?.[activeProvider] ?? stored?.sessionId ?? null);
        }
        applyLiveView(ctxId, storedRef.current);
        window.setTimeout(() => inputRef.current?.focus(), 0);
    }

    async function onSend() {
        const prompt = input.trim();
        if (!prompt || !Native || isChannelBusy(channelId)) return;
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
        cancelLiveJob(channelId);
        storedRef.current = [];
        if (!channelId) {
            setMessages([]);
            setSessionId(null);
            setBusy(false);
            return;
        }
        await clearThread(channelId);
        sessionsRef.current = {};
        setMessages([]);
        setSessionId(null);
        setBusy(false);
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
        >
            <div
                className={cl("root")}
                onWheel={e => {
                    e.stopPropagation();
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
