/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function getClientTimeZone(): string | null {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone;
	} catch {
		return null;
	}
}

export function appendTimeZoneHeader(headers: Record<string, string> = {}): Record<string, string> {
	const timeZone = getClientTimeZone();

	return timeZone == null ? headers : {
		...headers,
		'X-Timezone': timeZone,
	};
}
