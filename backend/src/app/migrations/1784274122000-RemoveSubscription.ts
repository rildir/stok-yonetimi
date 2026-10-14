import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveSubscription1784274122000 implements MigrationInterface {
  name = 'RemoveSubscription1784274122000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `users` DROP COLUMN `subscriptionPlan`');
    await queryRunner.query('ALTER TABLE `users` DROP COLUMN `subscriptionExpiresAt`');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `users` ADD `subscriptionExpiresAt` datetime NULL");
    await queryRunner.query("ALTER TABLE `users` ADD `subscriptionPlan` varchar(255) NOT NULL DEFAULT 'standard'");
  }
}
