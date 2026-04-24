/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('user_check_in_summary')
export class MiUserCheckInSummary {
	@PrimaryColumn(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Column('integer')
	public totalCheckIns: number;

	@Column('integer')
	public currentStreak: number;

	@Column('integer')
	public maxStreak: number;

	@Column('timestamp with time zone')
	public lastCheckInAt: Date;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone')
	public updatedAt: Date;
}
