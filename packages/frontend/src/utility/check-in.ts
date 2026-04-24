/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { apiUrl } from '@@/js/config.js';
import { $i } from '@/i.js';

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

function formatLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function normalizeLocalDateString(value: string | undefined | null, fallback: string): string {
	if (value == null || value === '') return fallback;
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return fallback;

	return formatLocalDate(parsed);
}

function getLocalToday() {
	const now = new Date();
	const dateKey = formatLocalDate(now);
	const [year, month, day] = dateKey.split('-').map(Number);
	return {
		now,
		dateKey,
		year,
		month,
		day,
	};
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
	const today = getLocalToday();
	const lastCheckInDate = normalizeLocalDateString(response.lastCheckInAt, '');
	const localToday = today.dateKey;
	return {
		serverDate: localToday,
		checkInDateUtc8: normalizeLocalDateString(response.checkInDateUtc8 ?? response.serverDate ?? response.lastCheckInAt, localToday),
		isCheckedInToday: lastCheckInDate !== '' ? lastCheckInDate === localToday : response.isCheckedInToday ?? false,
		currentStreak: response.currentStreak ?? 0,
		totalCheckIns: response.totalCheckIns ?? 0,
		maxStreak: response.maxStreak ?? response.currentStreak ?? 0,
		lastCheckInAt: response.lastCheckInAt ?? null,
	};
}

function normalizeCalendar(response: CheckInCalendarResponse, year: number, month: number): CheckInCalendar {
	const fallbackPrefix = `${year}-${`${month}`.padStart(2, '0')}-01`;
	return {
		year: response.year ?? year,
		month: response.month ?? month,
		checkInDateUtc8: (response.checkInDateUtc8 ?? response.checkedDates ?? [])
			.map(date => normalizeLocalDateString(date, fallbackPrefix)),
		rewardSummary: response.rewardSummary,
	};
}

export function getCurrentCheckInMonth() {
	const today = getLocalToday();
	return {
		year: today.year,
		month: today.month,
	};
}

export async function fetchCheckInStatus() {
	if ($i == null) {
		const today = getLocalToday();
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

	return normalizeStatus(await request<CheckInStatusResponse>('i/check-in/status'));
}

export async function fetchCheckInCalendar(year: number, month: number) {
	if ($i == null) {
		return {
			year,
			month,
			checkInDateUtc8: [],
		};
	}

	return normalizeCalendar(await request<CheckInCalendarResponse>('i/check-in/calendar', { year, month }), year, month);
}

export async function submitCheckIn() {
	if ($i == null) throw new Error('signin required');
	return normalizeStatus(await request<CheckInSubmitResponse>('i/check-in'));
}
