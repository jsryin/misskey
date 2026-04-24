/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CheckIn1767220000000 {
    name = 'CheckIn1767220000000'

    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "check_in_record" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "checkedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "checkInDateUtc8" date NOT NULL, "source" character varying(32) NOT NULL, "reward" jsonb NOT NULL DEFAULT '{}', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_check_in_record_id" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_check_in_record_userId" ON "check_in_record" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_check_in_record_checkedAt" ON "check_in_record" ("checkedAt") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_check_in_record_user_date" ON "check_in_record" ("userId", "checkInDateUtc8") `);
        await queryRunner.query(`CREATE TABLE "user_check_in_summary" ("userId" character varying(32) NOT NULL, "totalCheckIns" integer NOT NULL, "currentStreak" integer NOT NULL, "maxStreak" integer NOT NULL, "lastCheckInAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_user_check_in_summary_userId" PRIMARY KEY ("userId"))`);
        await queryRunner.query(`ALTER TABLE "check_in_record" ADD CONSTRAINT "FK_check_in_record_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "user_check_in_summary" ADD CONSTRAINT "FK_user_check_in_summary_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_check_in_summary" DROP CONSTRAINT "FK_user_check_in_summary_userId"`);
        await queryRunner.query(`ALTER TABLE "check_in_record" DROP CONSTRAINT "FK_check_in_record_userId"`);
        await queryRunner.query(`DROP TABLE "user_check_in_summary"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_check_in_record_user_date"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_check_in_record_checkedAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_check_in_record_userId"`);
        await queryRunner.query(`DROP TABLE "check_in_record"`);
    }
}
