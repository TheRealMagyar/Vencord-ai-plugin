/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { copyWithToast, insertTextIntoChatInputBox } from "@utils/discord";
import { Message, RenderModalProps } from "@vencord/discord-types";
import { ChannelStore, Modal, openModal, Parser, useEffect, useRef, useState } from "@webpack/common";

import { GrokIcon } from "./GrokIcon";
import { settings } from "./settings";
import type { ChatMessage, GrokStatus } from "./types";
import { cl, getMessageContent, getNative, t } from "./utils";

interface OpenOptions {
    seedPrompt?: string;
    explainMessage?: Message;
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

function GrokModal({ rootProps, options }: { rootProps: RenderModalProps; options?: OpenOptions; }) {
    const { language, model, allowWebSearch, grokPath } = settings.use(["language", "model", "allowWebSearch", "grokPath"]);
    const [status, setStatus] = useState<GrokStatus | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const scroller = useRef<HTMLDivElement>(null);
    const started = useRef(false);
    const Native = getNative();

    const lang = language as "auto" | "hu" | "en";

    useEffect(() => {
        scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
    }, [messages, busy]);

    useEffect(() => {
        if (started.current) return;
        started.current = true;

        (async () => {
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
                        "Ez a plugin csak asztali Discordon / Vesktopon működik (Grok CLI kell).",
                        "This plugin only works on desktop Discord / Vesktop (Grok CLI required).",
                        lang,
                    ),
                });
                return;
            }

            const next = await Native.getStatus(grokPath || undefined);
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
                    request: () => Native.explainMessage({
                        content,
                        author,
                        channelName: channel?.name,
                        language: lang,
                        model,
                        grokPath: grokPath || undefined,
                    }),
                });
                return;
            }

            if (options?.seedPrompt) {
                setInput(options.seedPrompt);
            }
        })();
    }, []);

    async function ask(opts: {
        kind: "chat" | "explain";
        visible: string;
        request: () => Promise<{ ok: boolean; text: string; sessionId: string | null; error: string | null; }>;
    }) {
        if (busy) return;
        setBusy(true);

        const userMsg: ChatMessage = { id: nextId(), role: "user", text: opts.visible };
        const pending: ChatMessage = {
            id: nextId(),
            role: "assistant",
            text: t("Grok gondolkodik…", "Grok is thinking…", lang),
            pending: true,
        };
        setMessages(prev => [...prev, userMsg, pending]);

        try {
            const reply = await opts.request();
            if (reply.sessionId) setSessionId(reply.sessionId);

            setMessages(prev => prev.map(msg => msg.id === pending.id
                ? {
                    ...msg,
                    pending: false,
                    text: reply.ok
                        ? unwrapReplyText(reply.text)
                        : (reply.error || t("Ismeretlen Grok hiba.", "Unknown Grok error.", lang)),
                }
                : msg
            ));
        } catch (error) {
            setMessages(prev => prev.map(msg => msg.id === pending.id
                ? {
                    ...msg,
                    pending: false,
                    text: error instanceof Error ? error.message : String(error),
                }
                : msg
            ));
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
            request: () => Native.sendChat({
                prompt,
                sessionId,
                model,
                language: lang,
                allowWebSearch,
                grokPath: grokPath || undefined,
            }),
        });
    }

    const connected = Boolean(status?.installed && status.authenticated);
    const title = status?.displayName ? `Grok · ${status.displayName}` : "Grok";

    return (
        <Modal {...rootProps} size="lg" title={title} subtitle={
            <span className={cl("status")}>
                <span className={cl("dot", { ok: connected })} />
                {connected
                    ? t("Csatlakozva a Grok CLI-hez", "Connected to Grok CLI", lang)
                    : (status?.error || t("Kapcsolódás…", "Connecting…", lang))}
            </span>
        }>
            <div className={cl("root")}>
                <div className={cl("messages")} ref={scroller}>
                    {messages.length === 0 && (
                        <div className={cl("empty")}>
                            <div className={cl("empty-icon")}>
                                <GrokIcon height={32} width={32} />
                            </div>
                            <strong>{t("Szia! Én vagyok a Grok.", "Hi — I'm Grok.", lang)}</strong>
                            <div>
                                {t(
                                    "Írj ide, és a helyi Grok előfizetéseddel válaszolok.",
                                    "Type below and I'll answer with your local Grok subscription.",
                                    lang,
                                )}
                            </div>
                        </div>
                    )}

                    {messages.map(msg => (
                        <div key={msg.id} className={cl("row", msg.role)}>
                            <div className={cl("meta")}>
                                {msg.role === "user"
                                    ? t("Te", "You", lang)
                                    : "Grok"}
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
                        placeholder={t("Írj Grok-nak…  Enter küld, Shift+Enter új sor", "Message Grok…  Enter to send, Shift+Enter for a new line", lang)}
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
