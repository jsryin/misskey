/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { CheckInRecordsRepository, UserCheckInSummariesRepository } from '@/models/_.js';
import { MiCheckInRecord } from '@/models/CheckInRecord.js';
import { MiUserCheckInSummary } from '@/models/UserCheckInSummary.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';

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
	checkedAt: string[];
	checkedDates: string[];
	rewardSummary: Record<string, unknown>;
};

export type SubmitCheckInResult = CheckInStatus & {
	created: boolean;
	alreadyCheckedIn: boolean;
};

@Injectable()
export class CheckInService {
	constructor(
		@Inject(DI.checkInRecordsRepository)
		private checkInRecordsRepository: CheckInRecordsRepository,

		@Inject(DI.userCheckInSummariesRepository)
		private userCheckInSummariesRepository: UserCheckInSummariesRepository,

		@Inject(DI.db)
		private db: DataSource,

		private idService: IdService,
	) {
	}

	private readonly dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

	public async getStatus(userId: string, now = new Date()): Promise<CheckInStatus> {
		const currentCheckInDateUtc8 = this.formatUtc8Date(now);
		const summary = await this.userCheckInSummariesRepository.findOneBy({ userId });
		return this.packStatus(summary, currentCheckInDateUtc8);
	}

	public async submit(userId: string, source = 'web'): Promise<SubmitCheckInResult> {
		const checkedAt = new Date();
		const currentCheckInDateUtc8 = this.formatUtc8Date(checkedAt);

		const existingSummary = await this.userCheckInSummariesRepository.findOneBy({ userId });
		if (existingSummary != null && this.formatUtc8Date(existingSummary.lastCheckInAt) === currentCheckInDateUtc8) {
			return {
				created: false,
				alreadyCheckedIn: true,
				...this.packStatus(existingSummary, currentCheckInDateUtc8),
			};
		}

		try {
			await this.db.transaction(async transactionalEntityManager => {
				await transactionalEntityManager.insert(MiCheckInRecord, {
					id: this.idService.gen(),
					userId,
					checkedAt,
					checkInDateUtc8: currentCheckInDateUtc8,
					source,
					reward: {},
					createdAt: checkedAt,
				});

				const summary = await transactionalEntityManager.findOneBy(MiUserCheckInSummary, { userId });
				if (summary == null) {
					await transactionalEntityManager.insert(MiUserCheckInSummary, {
						userId,
						totalCheckIns: 1,
						currentStreak: 1,
						maxStreak: 1,
						lastCheckInAt: checkedAt,
						createdAt: checkedAt,
						updatedAt: checkedAt,
					});
					return;
				}

				const lastCheckInDateUtc8 = this.formatUtc8Date(summary.lastCheckInAt);
				const nextCurrentStreak = this.isPreviousDate(lastCheckInDateUtc8, currentCheckInDateUtc8) ? summary.currentStreak + 1 : 1;

				await transactionalEntityManager.update(MiUserCheckInSummary, { userId }, {
					totalCheckIns: summary.totalCheckIns + 1,
					currentStreak: nextCurrentStreak,
					maxStreak: Math.max(summary.maxStreak, nextCurrentStreak),
					lastCheckInAt: checkedAt,
					updatedAt: checkedAt,
				});
			});
		} catch (error) {
			if (!isDuplicateKeyValueError(error)) throw error;

			return {
				created: false,
				alreadyCheckedIn: true,
				...(await this.getStatus(userId, checkedAt)),
			};
		}

		return {
			created: true,
			alreadyCheckedIn: false,
			...(await this.getStatus(userId, checkedAt)),
		};
	}

	public async getCalendar(userId: string, year: number, month: number, timeZone?: string | null): Promise<CheckInCalendar> {
		const normalizedTimeZone = this.normalizeTimeZone(timeZone);
		const start = this.zonedDateTimeToUtc(year, month, 1, normalizedTimeZone);
		const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
		const end = this.zonedDateTimeToUtc(nextMonth.year, nextMonth.month, 1, normalizedTimeZone);

		const rows = await this.checkInRecordsRepository.createQueryBuilder('record')
			.select('record.checkedAt', 'checkedAt')
			.where('record.userId = :userId', { userId })
			.andWhere('record.checkedAt >= :start', { start })
			.andWhere('record.checkedAt < :end', { end })
			.orderBy('record.checkedAt', 'ASC')
			.getRawMany<{ checkedAt: string | Date }>();

		const checkedAt = rows
			.map(row => row.checkedAt instanceof Date ? row.checkedAt : new Date(row.checkedAt))
			.filter(date => {
				const parts = this.getDatePartsInTimeZone(date, normalizedTimeZone);
				return parts.year === year && parts.month === month;
			});

		return {
			year,
			month,
			checkedAt: checkedAt.map(date => date.toISOString()),
			checkedDates: checkedAt.map(date => this.formatDateInTimeZone(date, normalizedTimeZone)),
			rewardSummary: {},
		};
	}

	private packStatus(summary: MiUserCheckInSummary | null, currentCheckInDateUtc8: string): CheckInStatus {
		const isCheckedInToday = summary != null && this.formatUtc8Date(summary.lastCheckInAt) === currentCheckInDateUtc8;

		return {
			serverDate: currentCheckInDateUtc8,
			checkInDateUtc8: currentCheckInDateUtc8,
			isCheckedInToday,
			currentStreak: summary?.currentStreak ?? 0,
			totalCheckIns: summary?.totalCheckIns ?? 0,
			maxStreak: summary?.maxStreak ?? 0,
			lastCheckInAt: summary?.lastCheckInAt.toISOString() ?? null,
		};
	}

	private formatUtc8Date(date: Date): string {
		const utc8Time = date.getTime() + (8 * 60 * 60 * 1000);
		const utc8Date = new Date(utc8Time);
		const year = utc8Date.getUTCFullYear();
		const month = `${utc8Date.getUTCMonth() + 1}`.padStart(2, '0');
		const day = `${utc8Date.getUTCDate()}`.padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	private isPreviousDate(previousDate: string, currentDate: string): boolean {
		return this.shiftDate(previousDate, 1) === currentDate;
	}

	private shiftDate(dateKey: string, days: number): string {
		const date = new Date(`${dateKey}T00:00:00.000Z`);
		date.setUTCDate(date.getUTCDate() + days);
		const year = date.getUTCFullYear();
		const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
		const day = `${date.getUTCDate()}`.padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	private normalizeTimeZone(timeZone?: string | null): string {
		if (timeZone == null || timeZone === '') return 'UTC';

		try {
			new Intl.DateTimeFormat('en-US', { timeZone }).format();
			return timeZone;
		} catch {
			return 'UTC';
		}
	}

	private getDateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
		let formatter = this.dateTimeFormatters.get(timeZone);

		if (formatter == null) {
			formatter = new Intl.DateTimeFormat('en-CA', {
				timeZone,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hourCycle: 'h23',
			});
			this.dateTimeFormatters.set(timeZone, formatter);
		}

		return formatter;
	}

	private getDatePartsInTimeZone(date: Date, timeZone: string): {
		year: number;
		month: number;
		day: number;
		hour: number;
		minute: number;
		second: number;
	} {
		const parts = this.getDateTimeFormatter(timeZone).formatToParts(date);
		const getValue = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value ?? '0');

		return {
			year: getValue('year'),
			month: getValue('month'),
			day: getValue('day'),
			hour: getValue('hour'),
			minute: getValue('minute'),
			second: getValue('second'),
		};
	}

	private formatDateInTimeZone(date: Date, timeZone: string): string {
		const parts = this.getDatePartsInTimeZone(date, timeZone);
		return `${parts.year}-${`${parts.month}`.padStart(2, '0')}-${`${parts.day}`.padStart(2, '0')}`;
	}

	private getTimeZoneOffsetMilliseconds(date: Date, timeZone: string): number {
		const parts = this.getDatePartsInTimeZone(date, timeZone);
		const utcTime = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
		return utcTime - date.getTime();
	}

	private zonedDateTimeToUtc(year: number, month: number, day: number, timeZone: string): Date {
		const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0);
		const firstPass = utcGuess - this.getTimeZoneOffsetMilliseconds(new Date(utcGuess), timeZone);
		const secondPass = utcGuess - this.getTimeZoneOffsetMilliseconds(new Date(firstPass), timeZone);
		return new Date(secondPass);
	}
}
