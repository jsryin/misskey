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
	checkInDateUtc8: string[];
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

	public async getCalendar(userId: string, year: number, month: number): Promise<CheckInCalendar> {
		const start = `${year}-${`${month}`.padStart(2, '0')}-01`;
		const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
		const end = `${nextMonth.year}-${`${nextMonth.month}`.padStart(2, '0')}-01`;

		const rows = await this.checkInRecordsRepository.createQueryBuilder('record')
			.select('record.checkInDateUtc8', 'checkInDateUtc8')
			.where('record.userId = :userId', { userId })
			.andWhere('record.checkInDateUtc8 >= :start', { start })
			.andWhere('record.checkInDateUtc8 < :end', { end })
			.orderBy('record.checkInDateUtc8', 'ASC')
			.getRawMany<{ checkInDateUtc8: string }>();

		return {
			year,
			month,
			checkInDateUtc8: rows.map(row => row.checkInDateUtc8),
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
}
