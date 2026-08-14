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
    default: {
        viewBox: "0 0 24 24",
        html: '<path fill="currentColor" fill-rule="evenodd" d="m7.084 11.084 1.467-4.4h1.898l1.467 4.4 4.4 1.467v1.898l-4.4 1.467-1.467 4.4H8.55l-1.467-4.4-4.4-1.467V12.55zm2.416-.922-.676 2.03-.633.632-2.029.676 2.03.676.632.633.676 2.029.676-2.03.633-.632 2.029-.676-2.03-.676-.632-.633zm6.65-5.012.78-2.34h1.14l.78 2.34 2.34.78v1.14l-2.34.78-.78 2.34h-1.14l-.78-2.34-2.34-.78V5.93z" clip-rule="evenodd"/>',
    },
    grok: {
        viewBox: "0 0 24 24",
        html: '<g clip-path="url(#ai-icon-grok)"><path fill="currentColor" d="m9.269 15.285 7.979-5.923c.391-.29.95-.177 1.136.274.982 2.379.543 5.237-1.408 7.2s-4.668 2.393-7.15 1.413l-2.711 1.263c3.889 2.673 8.611 2.012 11.562-.958 2.341-2.354 3.066-5.563 2.388-8.457l.006.007c-.983-4.251.242-5.95 2.75-9.425q.09-.123.179-.249l-3.301 3.32v-.01L9.267 15.287m-1.645 1.438c-2.79-2.682-2.31-6.832.072-9.225 1.761-1.77 4.647-2.494 7.166-1.431l2.705-1.256a7.8 7.8 0 0 0-1.829-1.003 8.95 8.95 0 0 0-9.752 1.973c-2.533 2.547-3.33 6.465-1.962 9.807 1.022 2.498-.653 4.265-2.34 6.049-.599.632-1.199 1.265-1.682 1.934l7.62-6.846"/></g><defs><clipPath id="ai-icon-grok"><path fill="currentColor" d="M0 0h24v24H0z"/></clipPath></defs>',
    },
    openai: {
        viewBox: "0 0 24 24",
        html: '<g clip-path="url(#ai-icon-openai)"><path fill="currentColor" d="M9.205 8.758v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.8.8 0 0 0-.856 0zm10.609 8.8V12.16c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.43.43 0 0 1 .476 0l4.544 2.617c1.308.76 2.188 2.378 2.188 3.948 0 1.808-1.07 3.473-2.76 4.163M7.802 12.803l-1.95-1.142a.45.45 0 0 1-.239-.428V5.999c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.167c-.285.166-.428.404-.428.737zM12 15.228l-2.795-1.57v-3.33L12 8.758l2.795 1.57v3.33zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472m-5.637-5.303-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.48 4.48 0 0 1 4.21 6.427v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.117a.43.43 0 0 1-.476 0m-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71q.429.25.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523m5.899 2.83a5.95 5.95 0 0 0 5.827-4.756C22.287 18.439 24 15.94 24 13.396c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947a5.7 5.7 0 0 0-1.88.31A5.96 5.96 0 0 0 10.205.1a5.95 5.95 0 0 0-5.827 4.757C1.713 5.547 0 8.044 0 10.59c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 0 0 4.162 1.713"/></g><defs><clipPath id="ai-icon-openai"><path fill="currentColor" d="M0 0h24v24H0z"/></clipPath></defs>',
    },
    atom: {
        viewBox: "0 0 24 24",
        html: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2" d="M12 12.09V12m8.962 8.962c-1.895 1.896-7.445-.58-12.395-5.53S1.142 4.933 3.037 3.037c1.896-1.895 7.446.58 12.395 5.53 4.95 4.95 7.426 10.5 5.53 12.395Zm-17.925 0c-1.895-1.895.58-7.445 5.53-12.395s10.5-7.425 12.396-5.53c1.895 1.896-.58 7.446-5.53 12.395-4.95 4.95-10.5 7.426-12.396 5.53Z"/>',
    },
};

const LEGACY_PRESETS: Record<string, string> = {
    sparkle: "default",
    chatgpt: "default",
    codex: "default",
    orbit: "atom",
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
        const raw = String(settings.store.iconPreset || "default");
        return {
            preset: LEGACY_PRESETS[raw] ?? raw,
            svg: String(settings.store.iconSvg ?? ""),
        };
    } catch {
        return { preset: "default", svg: "" };
    }
}

export const GrokIcon: IconComponent = ({ height = 20, width = 20, className, ...rest }) => {
    const { preset, svg } = readIconChoice();
    const chosen = preset === "custom"
        ? (sanitizeSvg(svg) ?? PRESETS.default)
        : (PRESETS[preset] ?? PRESETS.default);

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
