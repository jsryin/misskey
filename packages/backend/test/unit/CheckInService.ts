/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { Test, type TestingModule } from '@nestjs/testing';
import { GlobalModule } from '@/GlobalModule.js';
import { CoreModule } from '@/core/CoreModule.js';
import { CheckInService } from '@/core/CheckInService.js';
import { IdService } from '@/core/IdService.js';
import { DI } from '@/di-symbols.js';
import type {
	CheckInRecordsRepository,
	UserProfilesRepository,
	UsersRepository,
} from '@/models/_.js';

describe('CheckInService', () => {
	let app: TestingModule;
	let checkInService: CheckInService;
	let idService: IdService;
	let checkInRecordsRepository: CheckInRecordsRepository;
	let userProfilesRepository: UserProfilesRepository;
	let usersRepository: UsersRepository;

	beforeAll(async () => {
		app = await Test.createTestingModule({
			imports: [
				GlobalModule,
				CoreModule,
			],
		}).compile();

		app.enableShutdownHooks();

		checkInService = app.get(CheckInService);
		idService = app.get(IdService);
		checkInRecordsRepository = app.get(DI.checkInRecordsRepository);
		userProfilesRepository = app.get(DI.userProfilesRepository);
		usersRepository = app.get(DI.usersRepository);
	});

	afterAll(async () => {
		await checkInRecordsRepository.createQueryBuilder().delete().execute();
		await userProfilesRepository.createQueryBuilder().delete().execute();
		await usersRepository.createQueryBuilder().delete().execute();
		await app.close();
	});

	test('getCalendar filters records by request timezone month boundaries', async () => {
		const userId = idService.gen();

		await usersRepository.insert({
			id: userId,
			username: `user_${userId}`,
			usernameLower: `user_${userId}`.toLowerCase(),
		});

		await userProfilesRepository.insert({
			userId,
		});

		await checkInRecordsRepository.insert([
			{
				id: idService.gen(),
				userId,
				checkedAt: new Date('2026-03-31T15:30:00.000Z'),
				checkInDateUtc8: '2026-03-31',
				source: 'test',
				reward: {},
				createdAt: new Date('2026-03-31T15:30:00.000Z'),
			},
			{
				id: idService.gen(),
				userId,
				checkedAt: new Date('2026-04-01T15:30:00.000Z'),
				checkInDateUtc8: '2026-04-01',
				source: 'test',
				reward: {},
				createdAt: new Date('2026-04-01T15:30:00.000Z'),
			},
			{
				id: idService.gen(),
				userId,
				checkedAt: new Date('2026-04-30T15:30:00.000Z'),
				checkInDateUtc8: '2026-04-30',
				source: 'test',
				reward: {},
				createdAt: new Date('2026-04-30T15:30:00.000Z'),
			},
		]);

		const calendar = await checkInService.getCalendar(userId, 2026, 4, 'Asia/Tokyo');

		expect(calendar.checkedDates).toEqual([
			'2026-04-01',
			'2026-04-02',
		]);
		expect(calendar.checkedAt).toEqual([
			'2026-03-31T15:30:00.000Z',
			'2026-04-01T15:30:00.000Z',
		]);
	});
});
