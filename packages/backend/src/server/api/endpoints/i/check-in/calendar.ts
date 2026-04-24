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

	kind: 'read:account',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			year: { type: 'integer', optional: false, nullable: false },
			month: { type: 'integer', optional: false, nullable: false },
			checkedAt: {
				type: 'array',
				optional: false, nullable: false,
				items: { type: 'string', optional: false, nullable: false },
			},
			checkedDates: {
				type: 'array',
				optional: false, nullable: false,
				items: { type: 'string', optional: false, nullable: false },
			},
			rewardSummary: {
				type: 'object',
				optional: false, nullable: false,
				additionalProperties: true,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		year: { type: 'integer', minimum: 2000, maximum: 9999 },
		month: { type: 'integer', minimum: 1, maximum: 12 },
	},
	required: ['year', 'month'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private checkInService: CheckInService,
	) {
		super(meta, paramDef, async (ps, me, _token, _file, _cleanup, _ip, headers) => {
			return await this.checkInService.getCalendar(me.id, ps.year, ps.month, headers?.['x-timezone']);
		});
	}
}
