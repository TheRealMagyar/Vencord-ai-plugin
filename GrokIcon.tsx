/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classes } from "@utils/misc";
import { IconComponent } from "@utils/types";

import { settings } from "./settings";
import { cl } from "./utils";

const PRESETS: Record<string, { viewBox: string; html: string; }> = {
    sparkle: {
        viewBox: "0 0 24 24",
        html: '<path fill="currentColor" d="M12 1.6 13.7 8.3 20.4 10 13.7 11.7 12 18.4 10.3 11.7 3.6 10 10.3 8.3 12 1.6Zm7.4 11.3 1 3.8 3.8 1-3.8 1-1 3.8-1-3.8-3.8-1 3.8-1 1-3.8ZM4.6 14.2l.8 2.7 2.7.8-2.7.8-.8 2.7-.8-2.7-2.7-.8 2.7-.8.8-2.7Z"/>',
    },
    grok: {
        viewBox: "0 0 24 24",
        html: '<path fill="currentColor" d="M12 1.4 13.6 8.2 20.6 9.8 13.6 11.4 12 18.2 10.4 11.4 3.4 9.8 10.4 8.2 12 1.4Zm0 6.1-0.7 2.8-2.8.7 2.8.7.7 2.8.7-2.8 2.8-.7-2.8-.7L12 7.5ZM19.2 13.4l.9 3.2 3.2.9-3.2.9-.9 3.2-.9-3.2-3.2-.9 3.2-.9.9-3.2ZM4.8 14.2l.7 2.4 2.4.7-2.4.7-.7 2.4-.7-2.4-2.4-.7 2.4-.7.7-2.4Z"/>',
    },
    openai: {
        viewBox: "0 0 24 24",
        html: '<path fill="currentColor" d="M12 2.1 19.4 6.4v11.2L12 21.9 4.6 17.6V6.4L12 2.1Zm0 1.9L6.4 7.3v9.4L12 20l5.6-3.3V7.3L12 4Zm0 3.1 3.8 2.2v4.4L12 16.9 8.2 14.7V10.3L12 8.1Zm0 1.9-1.9 1.1v2.2L12 14.4l1.9-1.1v-2.2L12 10Z"/>',
    },
    chatgpt: {
        viewBox: "0 0 24 24",
        html: '<path fill="currentColor" d="M7 3h10a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4h-4.2L7 22.2V18H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4Zm0 2a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2v2.3L11.3 16H17a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H7Zm1.6 4.2a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Zm3.4 0a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Zm3.4 0a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z"/>',
    },
    codex: {
        viewBox: "0 0 24 24",
        html: '<path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v12h16V6H4Zm3.1 3.1 1.2-1.1 4.1 4-4.1 4-1.2-1.1L10 12 7.1 9.1ZM13 14.2h5v1.7h-5v-1.7Z"/>',
    },
    orbit: {
        viewBox: "0 0 24 24",
        html: '<path fill="currentColor" d="M12 9.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6Zm0 2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6ZM12 3c4.2 0 7.8 1.7 9.4 4.2S22.6 12.8 21.4 15.4 17.6 20 12 20 4.2 18.3 2.6 15.8 1.4 11.2 2.6 8.6 6.4 3 12 3Zm0 1.8c-4.4 0-7.3 1.4-8.4 3.4S2.9 13 4.4 15.1s4.3 3.1 7.6 3.1 6.2-1 7.6-3.1 2-5.3.8-7.3S16.4 4.8 12 4.8Z"/>',
    },
};

function sanitizeSvg(raw: string) {
    try {
        const source = raw.trim();
        if (!source) return null;

        const stripped = source
            .replace(/<\?xml[\s\S]*?\?>/gi, "")
            .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
            .trim();

        const full = stripped.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>/i);
        const inner = full
            ? full[2]
            : /^<(path|g|circle|rect|polygon|polyline|line|ellipse)\b/i.test(stripped)
                ? stripped
                : null;
        if (!inner) return null;

        const viewBox = full?.[1].match(/viewBox\s*=\s*["']([^"']+)["']/i)?.[1] || "0 0 24 24";
        const html = inner
            .replace(/<script\b[\s\S]*?<\/script>/gi, "")
            .replace(/<style\b[\s\S]*?<\/style>/gi, "")
            .replace(/<foreignObject\b[\s\S]*?<\/foreignObject>/gi, "")
            .replace(/<image\b[\s\S]*?(?:\/>|><\/image>)/gi, "")
            .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
            .replace(/\s(?:href|xlink:href)\s*=\s*("|')\s*javascript:[^"']*\1/gi, "");

        if (!html.trim()) return null;
        return { viewBox, html };
    } catch {
        return null;
    }
}

function readIconChoice() {
    try {
        return {
            preset: String(settings.store.iconPreset || "sparkle"),
            svg: String(settings.store.iconSvg ?? ""),
        };
    } catch {
        return { preset: "sparkle", svg: "" };
    }
}

export const GrokIcon: IconComponent = ({ height = 20, width = 20, className, ...rest }) => {
    const { preset, svg } = readIconChoice();
    const chosen = preset === "custom"
        ? (sanitizeSvg(svg) ?? PRESETS.sparkle)
        : (PRESETS[preset] ?? PRESETS.sparkle);

    return (
        <svg
            viewBox={chosen.viewBox}
            height={height}
            width={width}
            className={classes(cl("icon"), className)}
            aria-hidden="true"
            fill="currentColor"
            {...rest}
            dangerouslySetInnerHTML={{ __html: chosen.html }}
        />
    );
};

export const AiIcon = GrokIcon;
