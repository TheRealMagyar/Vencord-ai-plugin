/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classes } from "@utils/misc";
import { IconComponent } from "@utils/types";

import { settings } from "./settings";
import { cl } from "./utils";

const DEFAULT_PATH = "M12 1.6 13.7 8.3 20.4 10 13.7 11.7 12 18.4 10.3 11.7 3.6 10 10.3 8.3 12 1.6Zm7.4 11.3 1 3.8 3.8 1-3.8 1-1 3.8-1-3.8-3.8-1 3.8-1 1-3.8ZM4.6 14.2l.8 2.7 2.7.8-2.7.8-.8 2.7-.8-2.7-2.7-.8 2.7-.8.8-2.7Z";

function sanitizeSvg(raw: string) {
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
}

export const GrokIcon: IconComponent = ({ height = 20, width = 20, className, ...rest }) => {
    const { iconSvg } = settings.use(["iconSvg"]);
    const custom = sanitizeSvg(iconSvg || "");

    if (custom) {
        return (
            <svg
                viewBox={custom.viewBox}
                height={height}
                width={width}
                className={classes(cl("icon"), className)}
                aria-hidden="true"
                fill="currentColor"
                dangerouslySetInnerHTML={{ __html: custom.html }}
                {...rest}
            />
        );
    }

    return (
        <svg
            viewBox="0 0 24 24"
            height={height}
            width={width}
            className={classes(cl("icon"), className)}
            aria-hidden="true"
            {...rest}
        >
            <path fill="currentColor" d={DEFAULT_PATH} />
        </svg>
    );
};

export const AiIcon = GrokIcon;
