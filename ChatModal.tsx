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
import type { ChatMessage, GrokStatus } from "./types";
import { cl, getMessageContent, getNative, t } from "./utils";

interface OpenOptions {
    seedPrompt?: string;
    explainMessage?: Message;
    channelId?: string;
}

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
        || SelectedChannelStore.getChannelId()
        || "";
}

function GrokModal({ rootProps, options }: { rootProps: RenderModalProps; options?: OpenOptions; }) {
    const { language, grokModel, codexModel, allowWebSearch, grokPath, includeChannelContext, provider, codexPath } = settings.use(["language", "grokModel", "codexModel", "allowWebSearch", "grokPath", "includeChannelContext", "provider", "codexPath"]);
    const [status, setStatus] = useState<GrokStatus | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const sessionsRef = useRef<Partial<Record<"grok" | "codex", string | null>>>({});
    const [channelId, setChannelId] = useState("");
    const [threadTitle, setThreadTitle] = useState("Grok");
    const scroller = useRef<HTMLDivElement>(null);
    const started = useRef(false);
    const messagesRef = useRef<ChatMessage[]>([]);
    const Native = getNative();

    const lang = language as "auto" | "hu" | "en";
    const activeProvider = (provider === "codex" ? "codex" : "grok") as "grok" | "codex";
    const providerLabel = activeProvider === "codex" ? "Codex" : "Grok";
    const selectedModel = activeProvider === "codex"
        ? (codexModel && codexModel !== "default" ? codexModel : undefined)
        : grokModel;

    useEffect(() => {
        scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    }, [messages, busy]);

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
                    error: t(
                        "Ez a plugin csak asztali Discordon / Vesktopon működik (helyi Grok vagy Codex CLI kell).",
                        "This plugin only works on desktop Discord / Vesktop (local Grok or Codex CLI required).",
                        lang,
                    ),
                });
                return;
            }

            const next = await Native.getStatus(activeProvider, (activeProvider === "codex" ? codexPath : grokPath) || undefined);
            setStatus(next);

            if (!next.authenticated) return;

            if (options?.explainMessage) {
                const content = getMessageContent(options.explainMessage);
                const author = options.explainMessage.author?.username;
                const channel = ChannelStore.getChannel(options.explainMessage.channel_id);
                await ask({
                    kind: "explain",
                    visible: t(
                        `Magyarázd el ezt az üzenetet${author ? ` (@${author})` : ""}:\n${content}`,
                        `Explain this message${author ? ` (@${author})` : ""}:\n${content}`,
                        lang,
                    ),
                    request: async () => {
                        const packed = await packChannelContext({
                            channelId: id,
                            prompt: content,
                            aroundId: options.explainMessage!.id,
                            highlightId: options.explainMessage!.id,
                            enabled: includeChannelContext,
                        });
                        const userPrompt = t(
                            `Magyarázd el ezt a Discord üzenetet (>>> jelöli). Térj ki a szlengre, hangnemre és a környező beszélgetésre.\nSzerző: ${author || "?"}\nCsatorna: ${channel?.name || title}\nÜzenet:\n${content}`,
                            `Explain this Discord message (marked with >>>). Cover slang, tone, and nearby conversation.\nAuthor: ${author || "?"}\nChannel: ${channel?.name || title}\nMessage:\n${content}`,
                            lang,
                        );
                        return Native.sendChat({
                            prompt: withTranscript(userPrompt, packed, "explain"),
                            sessionId: null,
                            model: selectedModel,
                            language: lang,
                            grokPath: grokPath || undefined,
                            provider: activeProvider,
                            codexPath: codexPath || undefined,
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

    async function ask(opts: {
        kind: "chat" | "explain";
        visible: string;
        request: () => Promise<{ ok: boolean; text: string; sessionId: string | null; error: string | null; }>;
        context?: { channelId: string; title: string; };
    }) {
        if (busy) return;
        setBusy(true);

        const ctxId = opts.context?.channelId || channelId;
        const ctxTitle = opts.context?.title || threadTitle;
        const userMsg: ChatMessage = { id: nextId(), role: "user", text: opts.visible, at: Date.now() };
        const pending: ChatMessage = {
            id: nextId(),
            role: "assistant",
            text: t(`${providerLabel} gondolkodik…`, `${providerLabel} is thinking…`, lang),
            pending: true,
        };
        const withPending = [...messagesRef.current, userMsg, pending];
        messagesRef.current = withPending;
        setMessages(withPending);

        try {
            const reply = await opts.request();
            const nextSession = reply.sessionId || sessionId;
            if (reply.sessionId) setSessionId(reply.sessionId);

            const done = withPending.map(msg => msg.id === pending.id
                ? {
                    ...msg,
                    pending: false,
                    at: Date.now(),
                    text: reply.ok
                        ? unwrapReplyText(reply.text)
                        : (reply.error || t("Ismeretlen Grok hiba.", "Unknown Grok error.", lang)),
                }
                : msg
            );
            messagesRef.current = done;
            setMessages(done);
            await persist(done, nextSession, ctxId, ctxTitle);
        } catch (error) {
            const done = withPending.map(msg => msg.id === pending.id
                ? {
                    ...msg,
                    pending: false,
                    at: Date.now(),
                    text: error instanceof Error ? error.message : String(error),
                }
                : msg
            );
            messagesRef.current = done;
            setMessages(done);
            await persist(done, sessionId, ctxId, ctxTitle);
        } finally {
            setBusy(false);
        }
    }

    async function onSend() {
        const prompt = input.trim();
        if (!prompt || !Native || busy) return;
        setInput("");

        await ask({
            kind: "chat",
            visible: prompt,
            request: async () => {
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
        <Modal {...rootProps} size="lg" title={title} subtitle={
            <span className={cl("status")}>
                <span className={cl("dot", { ok: connected })} />
                {connected
                    ? `${providerLabel} · ${status?.subscription || t("csatlakozva", "connected", lang)}`
                    : (status?.error || t("Kapcsolódás…", "Connecting…", lang))}
            </span>
        }>
            <div className={cl("root")}>
                <div className={cl("toolbar")}>
                    <span className={cl("toolbar-label")}>
                        {t("Előzmény:", "History:", lang)} {threadTitle}
                        {messages.length ? ` · ${messages.filter(m => !m.pending).length}` : ""}
                    </span>
                    <button className={cl("mini")} disabled={!messages.length} onClick={onClear}>
                        {t("Előzmény törlése", "Clear history", lang)}
                    </button>
                </div>

                <div className={cl("messages")} ref={scroller}>
                    {messages.length === 0 && (
                        <div className={cl("empty")}>
                            <div className={cl("empty-icon")}>
                                <GrokIcon height={32} width={32} />
                            </div>
                            <strong>{t(`Szia! Én vagyok a ${providerLabel}.`, `Hi — I'm ${providerLabel}.`, lang)}</strong>
                            <div>
                                {t(
                                    `Ez a beszélgetés ehhez van kötve: ${threadTitle}. Itt látod majd az előzményt is.`,
                                    `This conversation is tied to ${threadTitle}. History will show up here.`,
                                    lang,
                                )}
                            </div>
                        </div>
                    )}

                    {messages.map(msg => (
                        <div key={msg.id} className={cl("row", msg.role)}>
                            <div className={cl("meta")}>
                                {msg.role === "user" ? t("Te", "You", lang) : providerLabel}
                                {msg.at ? ` · ${formatTime(msg.at)}` : ""}
                            </div>
                            <div className={cl("bubble", msg.role, { pending: Boolean(msg.pending) })}>
                                {msg.role === "assistant" && !msg.pending
                                    ? renderMarkdown(msg.text)
                                    : msg.text}
                            </div>
                            {msg.role === "assistant" && !msg.pending && (
                                <div className={cl("actions")}>
                                    <button className={cl("mini")} onClick={() => copyWithToast(msg.text)}>
                                        {t("Másolás", "Copy", lang)}
                                    </button>
                                    <button
                                        className={cl("mini")}
                                        onClick={() => insertTextIntoChatInputBox(msg.text)}
                                    >
                                        {t("Beszúrás a chatbe", "Insert into chat", lang)}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className={cl("composer")}>
                    <textarea
                        className={cl("input")}
                        rows={2}
                        value={input}
                        disabled={busy || !connected}
                        placeholder={t(`Írj ${providerLabel}-nak…  Enter küld, Shift+Enter új sor`, `Message ${providerLabel}…  Enter to send, Shift+Enter for a new line`, lang)}
                        onChange={e => setInput(e.currentTarget.value)}
                        onKeyDown={e => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                onSend();
                            }
                        }}
                    />
                    <button className={cl("send")} disabled={busy || !connected || !input.trim()} onClick={onSend}>
                        {busy ? t("Várj…", "Wait…", lang) : t("Küldés", "Send", lang)}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

export function openGrokModal(options?: OpenOptions) {
    openModal(props => <GrokModal rootProps={props} options={options} />);
}
