/* eslint-disable */
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline schema (state before the globalization work, commit dac008c), exactly as TypeORM
 * `synchronize` created it - including the generated index/FK names that the following
 * migrations (RemoveSubscription, AddMultiTenancy, ...) drop or rename.
 *
 * On an empty database this creates every table, so `migration:run` works end-to-end on a
 * fresh install. Databases whose tables already existed (created by synchronize before
 * migrations were introduced) are left untouched (CREATE TABLE IF NOT EXISTS).
 */
export class InitialMigration1784274121999 implements MigrationInterface {
  name = 'InitialMigration1784274121999';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`categories\` (
        \`id\` varchar(36) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`slug\` varchar(255) NOT NULL,
        \`isDeleted\` tinyint NOT NULL DEFAULT '0',
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`IDX_420d9f679d41281f282f5bc7d0\` (\`slug\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`suppliers\` (
        \`id\` varchar(36) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`contactPerson\` varchar(255) DEFAULT NULL,
        \`email\` varchar(255) DEFAULT NULL,
        \`phone\` varchar(255) DEFAULT NULL,
        \`address\` varchar(255) DEFAULT NULL,
        \`notes\` varchar(255) DEFAULT NULL,
        \`rating\` int NOT NULL DEFAULT '5',
        \`leadTimeDays\` int NOT NULL DEFAULT '3',
        \`isDeleted\` tinyint NOT NULL DEFAULT '0',
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`IDX_7b53306ed78ff59215a7b77eb4\` (\`isDeleted\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`warehouses\` (
        \`id\` varchar(36) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`code\` varchar(255) NOT NULL,
        \`address\` varchar(255) DEFAULT NULL,
        \`isDeleted\` tinyint NOT NULL DEFAULT '0',
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`IDX_be9dd3cc2931f11f7440f2eeb1\` (\`name\`),
        UNIQUE KEY \`IDX_d8b96d60ff9a288f5ed862280d\` (\`code\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\` varchar(36) NOT NULL,
        \`username\` varchar(255) NOT NULL,
        \`password\` varchar(255) NOT NULL,
        \`role\` varchar(255) NOT NULL DEFAULT 'viewer',
        \`fullName\` varchar(255) NOT NULL,
        \`email\` varchar(255) DEFAULT NULL,
        \`department\` varchar(255) DEFAULT NULL,
        \`avatar\` longtext,
        \`tokenVersion\` int NOT NULL DEFAULT '0',
        \`subscriptionPlan\` varchar(255) NOT NULL DEFAULT 'standard',
        \`subscriptionExpiresAt\` datetime DEFAULT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`IDX_fe0bb3f6520ee0469504521e71\` (\`username\`),
        UNIQUE KEY \`IDX_97672ac88f789774dd47f7c8be\` (\`email\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`products\` (
        \`id\` varchar(36) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`sku\` varchar(255) NOT NULL,
        \`category\` varchar(255) NOT NULL,
        \`categoryId\` varchar(255) DEFAULT NULL,
        \`price\` decimal(10,2) NOT NULL,
        \`quantity\` int NOT NULL,
        \`minQuantity\` int NOT NULL,
        \`status\` varchar(255) NOT NULL DEFAULT 'In stock',
        \`unit\` varchar(255) NOT NULL DEFAULT 'Adet',
        \`isDeleted\` tinyint NOT NULL DEFAULT '0',
        \`supplierId\` varchar(255) DEFAULT NULL,
        \`imageUrl\` varchar(255) DEFAULT NULL,
        \`warehouses\` json DEFAULT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`IDX_c44ac33a05b144dd0d9ddcf932\` (\`sku\`),
        KEY \`IDX_c3932231d2385ac248d0888d95\` (\`category\`),
        KEY \`IDX_3b7a6bf7cc64d8bc8ebdb4c1f5\` (\`isDeleted\`),
        KEY \`IDX_c143cbc0299e1f9220c4b5debd\` (\`supplierId\`),
        KEY \`FK_ff56834e735fa78a15d0cf21926\` (\`categoryId\`),
        CONSTRAINT \`FK_c143cbc0299e1f9220c4b5debd8\` FOREIGN KEY (\`supplierId\`) REFERENCES \`suppliers\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`FK_ff56834e735fa78a15d0cf21926\` FOREIGN KEY (\`categoryId\`) REFERENCES \`categories\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`orders\` (
        \`id\` varchar(36) NOT NULL,
        \`orderNumber\` varchar(255) NOT NULL,
        \`customerName\` varchar(255) NOT NULL,
        \`date\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`status\` varchar(255) NOT NULL DEFAULT 'Pending',
        \`totalAmount\` decimal(10,2) NOT NULL,
        \`carrier\` varchar(255) DEFAULT NULL,
        \`trackingNumber\` varchar(255) DEFAULT NULL,
        \`deletedAt\` datetime(6) DEFAULT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`IDX_59b0c3b34ea0fa5562342f2414\` (\`orderNumber\`),
        KEY \`IDX_6dc3a53d92a338eb56dbc82cf5\` (\`date\`),
        KEY \`IDX_775c9f06fc27ae3ff8fb26f2c4\` (\`status\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`order_items\` (
        \`id\` varchar(36) NOT NULL,
        \`productId\` varchar(255) DEFAULT NULL,
        \`productName\` varchar(255) NOT NULL,
        \`quantity\` int NOT NULL,
        \`price\` decimal(10,2) NOT NULL,
        \`orderId\` varchar(255) NOT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`FK_f1d359a55923bb45b057fbdab0d\` (\`orderId\`),
        KEY \`FK_cdb99c05982d5191ac8465ac010\` (\`productId\`),
        CONSTRAINT \`FK_cdb99c05982d5191ac8465ac010\` FOREIGN KEY (\`productId\`) REFERENCES \`products\` (\`id\`) ON DELETE SET NULL,
        CONSTRAINT \`FK_f1d359a55923bb45b057fbdab0d\` FOREIGN KEY (\`orderId\`) REFERENCES \`orders\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`purchase_orders\` (
        \`id\` varchar(36) NOT NULL,
        \`poNumber\` varchar(255) NOT NULL,
        \`supplierId\` varchar(255) DEFAULT NULL,
        \`supplierName\` varchar(255) NOT NULL,
        \`status\` varchar(255) NOT NULL DEFAULT 'Draft',
        \`totalAmount\` decimal(10,2) NOT NULL DEFAULT '0.00',
        \`expectedDate\` varchar(255) DEFAULT NULL,
        \`notes\` varchar(255) DEFAULT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`IDX_2e0fc7a6605393a9bd691cdceb\` (\`poNumber\`),
        KEY \`IDX_0c3ff892a9f2ed16f59d31ccca\` (\`supplierId\`),
        KEY \`IDX_5272ac3aa931eedb14cd8789d6\` (\`status\`),
        KEY \`IDX_17ba54818dc8b8ea63659598f9\` (\`createdAt\`),
        CONSTRAINT \`FK_0c3ff892a9f2ed16f59d31cccae\` FOREIGN KEY (\`supplierId\`) REFERENCES \`suppliers\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`purchase_order_items\` (
        \`id\` varchar(36) NOT NULL,
        \`productId\` varchar(255) DEFAULT NULL,
        \`productName\` varchar(255) NOT NULL,
        \`quantity\` int NOT NULL,
        \`price\` decimal(10,2) NOT NULL,
        \`purchaseOrderId\` varchar(255) NOT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`FK_1de7eb246940b05765d2c99a7ec\` (\`purchaseOrderId\`),
        KEY \`FK_f87b1b82a3aff16d1cb5e49a656\` (\`productId\`),
        CONSTRAINT \`FK_1de7eb246940b05765d2c99a7ec\` FOREIGN KEY (\`purchaseOrderId\`) REFERENCES \`purchase_orders\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_f87b1b82a3aff16d1cb5e49a656\` FOREIGN KEY (\`productId\`) REFERENCES \`products\` (\`id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`stock_counts\` (
        \`id\` varchar(36) NOT NULL,
        \`countNumber\` varchar(255) NOT NULL,
        \`status\` varchar(255) NOT NULL DEFAULT 'InProgress',
        \`items\` text NOT NULL,
        \`startedAt\` datetime NOT NULL,
        \`completedAt\` datetime DEFAULT NULL,
        \`performedBy\` varchar(255) NOT NULL,
        \`notes\` varchar(255) DEFAULT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`IDX_c9e9db360be03a918059dfcafc\` (\`countNumber\`),
        KEY \`IDX_4de46d2db344e171118ffa04f2\` (\`status\`),
        KEY \`IDX_9bce808517d49f6908f616fcd9\` (\`createdAt\`)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`stock_movements\` (
        \`id\` varchar(36) NOT NULL,
        \`productId\` varchar(255) NOT NULL,
        \`productName\` varchar(255) NOT NULL,
        \`type\` varchar(255) NOT NULL,
        \`quantity\` int NOT NULL,
        \`previousQuantity\` int NOT NULL,
        \`newQuantity\` int NOT NULL,
        \`referenceId\` varchar(255) DEFAULT NULL,
        \`referenceType\` varchar(255) DEFAULT NULL,
        \`note\` varchar(255) DEFAULT NULL,
        \`performedBy\` varchar(255) DEFAULT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        KEY \`IDX_a3acb59db67e977be45e382fc5\` (\`productId\`),
        KEY \`IDX_cca7634960c09010c40b6490a1\` (\`type\`),
        KEY \`IDX_f38d3033b7f70b32431f84c8b8\` (\`createdAt\`),
        CONSTRAINT \`FK_a3acb59db67e977be45e382fc56\` FOREIGN KEY (\`productId\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`product_warehouse_stocks\` (
        \`id\` varchar(36) NOT NULL,
        \`productId\` varchar(255) NOT NULL,
        \`warehouseId\` varchar(255) NOT NULL,
        \`quantity\` int NOT NULL DEFAULT '0',
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`IDX_89839e7588776025241ab69467\` (\`productId\`,\`warehouseId\`),
        KEY \`FK_0653ec66b41d6aca3f0b59e3a3d\` (\`warehouseId\`),
        CONSTRAINT \`FK_0653ec66b41d6aca3f0b59e3a3d\` FOREIGN KEY (\`warehouseId\`) REFERENCES \`warehouses\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_a2fb32aeab5a6832b8a57cef50b\` FOREIGN KEY (\`productId\`) REFERENCES \`products\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of ['product_warehouse_stocks', 'stock_movements', 'stock_counts', 'purchase_order_items', 'purchase_orders', 'order_items', 'orders', 'products', 'users', 'warehouses', 'suppliers', 'categories']) {
      await queryRunner.query('DROP TABLE IF EXISTS `' + t + '`');
    }
  }
}
