/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('check_in_record')
@Index(['userId', 'checkInDateUtc8'], { unique: true })
export class MiCheckInRecord {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Index()
	@Column('timestamp with time zone')
	public checkedAt: Date;

	@Column('date')
	public checkInDateUtc8: string;

	@Column('varchar', {
		length: 32,
	})
	public source: string;

	@Column('jsonb', {
		default: {},
	})
	public reward: Record<string, unknown>;

	@Column('timestamp with time zone')
	public createdAt: Date;
}
