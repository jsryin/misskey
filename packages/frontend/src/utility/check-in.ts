/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { apiUrl } from '@@/js/config.js';
import { $i } from '@/i.js';
import { miLocalStorage } from '@/local-storage.js';

export type CheckInStatus = {
	serverDate: string;
	checkInDateUtc8: string;
	isCheckedInToday: boolean;
	currentStreak: number;
	totalCheckIns: number;
	maxStreak: number;
	lastCheckInAt: string | null;
};

export type CheckInCalendar = {
	year: number;
	month: number;
	checkInDateUtc8: string[];
	rewardSummary?: Record<string, unknown>;
};

type CheckInRecord = {
	userId: string;
	checkedAt: string;
	checkInDateUtc8: string;
};

type CheckInStatusResponse = Partial<CheckInStatus> & {
	serverDate?: string;
	checkInDateUtc8?: string;
};

type CheckInCalendarResponse = {
	year?: number;
	month?: number;
	checkInDateUtc8?: string[];
	checkedDates?: string[];
	rewardSummary?: Record<string, unknown>;
};

type CheckInSubmitResponse = CheckInStatusResponse & {
	created?: boolean;
	alreadyCheckedIn?: boolean;
};

function formatUtc8Date(date: Date): string {
	const utc8Time = date.getTime() + (8 * 60 * 60 * 1000);
	const utc8Date = new Date(utc8Time);
	const year = utc8Date.getUTCFullYear();
	const month = `${utc8Date.getUTCMonth() + 1}`.padStart(2, '0');
	const day = `${utc8Date.getUTCDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function getUtc8Today() {
	const now = new Date();
	const dateKey = formatUtc8Date(now);
	const [year, month, day] = dateKey.split('-').map(Number);
	return {
		now,
		dateKey,
		year,
		month,
		day,
	};
}

function getStorageKey(): 'checkInRecords' {
	return 'checkInRecords';
}

function getStoredRecords(): CheckInRecord[] {
	const raw = miLocalStorage.getItemAsJson(getStorageKey()) as CheckInRecord[] | undefined;
	if (!Array.isArray(raw)) return [];
	return raw.filter((record): record is CheckInRecord => {
		return typeof record?.userId === 'string'
			&& typeof record?.checkedAt === 'string'
			&& typeof record?.checkInDateUtc8 === 'string';
	});
}

function saveStoredRecords(records: CheckInRecord[]) {
	miLocalStorage.setItemAsJson(getStorageKey(), records);
}

function getUserRecords(userId: string) {
	return getStoredRecords()
		.filter(record => record.userId === userId)
		.sort((a, b) => a.checkInDateUtc8.localeCompare(b.checkInDateUtc8));
}

function buildStatus(records: CheckInRecord[]): CheckInStatus {
	const today = getUtc8Today();
	const uniqueDates = [...new Set(records.map(record => record.checkInDateUtc8))].sort();
	const dateSet = new Set(uniqueDates);
	const latestDate = uniqueDates.at(-1);

	let currentStreak = 0;
	if (latestDate != null) {
		let cursor = new Date(`${latestDate}T00:00:00+08:00`).getTime();
		while (dateSet.has(formatUtc8Date(new Date(cursor)))) {
			currentStreak++;
			cursor -= 24 * 60 * 60 * 1000;
		}
	}

	return {
		serverDate: today.dateKey,
		checkInDateUtc8: today.dateKey,
		isCheckedInToday: dateSet.has(today.dateKey),
		currentStreak,
		totalCheckIns: uniqueDates.length,
		maxStreak: calcMaxStreak(uniqueDates),
		lastCheckInAt: records.at(-1)?.checkedAt ?? null,
	};
}

function calcMaxStreak(uniqueDates: string[]) {
	if (uniqueDates.length === 0) return 0;

	let maxStreak = 1;
	let streak = 1;

	for (let i = 1; i < uniqueDates.length; i++) {
		const previous = new Date(`${uniqueDates[i - 1]}T00:00:00+08:00`);
		const current = new Date(`${uniqueDates[i]}T00:00:00+08:00`);
		const diff = current.getTime() - previous.getTime();

		if (diff === 24 * 60 * 60 * 1000) {
			streak++;
			maxStreak = Math.max(maxStreak, streak);
		} else {
			streak = 1;
		}
	}

	return maxStreak;
}

async function request<T>(endpoint: string, data: Record<string, unknown> = {}): Promise<T> {
	if ($i == null) throw new Error('signin required');

	const response = await window.fetch(`${apiUrl}/${endpoint}`, {
		method: 'POST',
		credentials: 'omit',
		cache: 'no-cache',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			...data,
			i: $i.token,
		}),
	});

	const text = await response.text();
	const body = text.length > 0 ? JSON.parse(text) : null;

	if (!response.ok) {
		throw body?.error ?? new Error(`request failed: ${response.status}`);
	}

	return body as T;
}

function normalizeStatus(response: CheckInStatusResponse): CheckInStatus {
	const today = getUtc8Today();
	return {
		serverDate: response.serverDate ?? today.dateKey,
		checkInDateUtc8: response.checkInDateUtc8 ?? response.serverDate ?? today.dateKey,
		isCheckedInToday: response.isCheckedInToday ?? false,
		currentStreak: response.currentStreak ?? 0,
		totalCheckIns: response.totalCheckIns ?? 0,
		maxStreak: response.maxStreak ?? response.currentStreak ?? 0,
		lastCheckInAt: response.lastCheckInAt ?? null,
	};
}

function normalizeCalendar(response: CheckInCalendarResponse, year: number, month: number): CheckInCalendar {
	return {
		year: response.year ?? year,
		month: response.month ?? month,
		checkInDateUtc8: response.checkInDateUtc8 ?? response.checkedDates ?? [],
		rewardSummary: response.rewardSummary,
	};
}

function loadLocalStatus(): CheckInStatus {
	if ($i == null) {
		const today = getUtc8Today();
		return {
			serverDate: today.dateKey,
			checkInDateUtc8: today.dateKey,
			isCheckedInToday: false,
			currentStreak: 0,
			totalCheckIns: 0,
			maxStreak: 0,
			lastCheckInAt: null,
		};
	}

	return buildStatus(getUserRecords($i.id));
}

function loadLocalCalendar(year: number, month: number): CheckInCalendar {
	const dates = $i == null ? [] : getUserRecords($i.id)
		.map(record => record.checkInDateUtc8)
		.filter(date => {
			const [recordYear, recordMonth] = date.split('-').map(Number);
			return recordYear === year && recordMonth === month;
		});

	return {
		year,
		month,
		checkInDateUtc8: dates,
	};
}

function submitLocalCheckIn(): CheckInSubmitResponse {
	if ($i == null) throw new Error('signin required');

	const today = getUtc8Today();
	const records = getStoredRecords();
	const alreadyCheckedIn = records.some(record => record.userId === $i.id && record.checkInDateUtc8 === today.dateKey);

	if (!alreadyCheckedIn) {
		records.push({
			userId: $i.id,
			checkedAt: today.now.toISOString(),
			checkInDateUtc8: today.dateKey,
		});
		saveStoredRecords(records);
	}

	return {
		...buildStatus(getUserRecords($i.id)),
		created: !alreadyCheckedIn,
		alreadyCheckedIn,
	};
}

export function getCurrentCheckInMonth() {
	const today = getUtc8Today();
	return {
		year: today.year,
		month: today.month,
	};
}

export async function fetchCheckInStatus() {
	if ($i == null) return loadLocalStatus();

	try {
		return normalizeStatus(await request<CheckInStatusResponse>('i/check-in/status'));
	} catch {
		return loadLocalStatus();
	}
}

export async function fetchCheckInCalendar(year: number, month: number) {
	if ($i == null) return loadLocalCalendar(year, month);

	try {
		return normalizeCalendar(await request<CheckInCalendarResponse>('i/check-in/calendar', { year, month }), year, month);
	} catch {
		return loadLocalCalendar(year, month);
	}
}

export async function submitCheckIn() {
	if ($i == null) throw new Error('signin required');

	try {
		return normalizeStatus(await request<CheckInSubmitResponse>('i/check-in'));
	} catch {
		return normalizeStatus(submitLocalCheckIn());
	}
}
