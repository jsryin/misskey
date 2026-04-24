/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { CheckInService } from '@/core/CheckInService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,

	kind: 'write:account',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			created: { type: 'boolean', optional: false, nullable: false },
			alreadyCheckedIn: { type: 'boolean', optional: false, nullable: false },
			serverDate: { type: 'string', optional: false, nullable: false },
			checkInDateUtc8: { type: 'string', optional: false, nullable: false },
			isCheckedInToday: { type: 'boolean', optional: false, nullable: false },
			currentStreak: { type: 'integer', optional: false, nullable: false },
			totalCheckIns: { type: 'integer', optional: false, nullable: false },
			maxStreak: { type: 'integer', optional: false, nullable: false },
			lastCheckInAt: { type: 'string', format: 'date-time', optional: false, nullable: true },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private checkInService: CheckInService,
	) {
		super(meta, paramDef, async (_ps, me) => {
			return await this.checkInService.submit(me.id, 'web');
		});
	}
}
