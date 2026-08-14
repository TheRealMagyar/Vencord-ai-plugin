/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 TheRealMagyar and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classes } from "@utils/misc";
import { IconComponent } from "@utils/types";

import { cl } from "./utils";

export const GrokIcon: IconComponent = ({ height = 20, width = 20, className, ...rest }) => (
    <svg
        viewBox="0 0 24 24"
        height={height}
        width={width}
        className={classes(cl("icon"), className)}
        aria-hidden="true"
        {...rest}
    >
        <path
            fill="currentColor"
            d="M12 1.6 13.7 8.3 20.4 10 13.7 11.7 12 18.4 10.3 11.7 3.6 10 10.3 8.3 12 1.6Zm7.4 11.3 1 3.8 3.8 1-3.8 1-1 3.8-1-3.8-3.8-1 3.8-1 1-3.8ZM4.6 14.2l.8 2.7 2.7.8-2.7.8-.8 2.7-.8-2.7-2.7-.8 2.7-.8.8-2.7Z"
        />
    </svg>
);
