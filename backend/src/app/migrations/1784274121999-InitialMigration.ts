/* eslint-disable */
import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialMigration1784274121999 implements MigrationInterface {
    name = 'InitialMigration1784274121999'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Ensure all tables exist (especially suppliers, order_items, purchase_order_items, product_warehouse_stocks if missing on production)
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`categories\` (
              \`id\` varchar(36) NOT NULL,
              \`name\` varchar(255) NOT NULL,
              \`code\` varchar(255) NOT NULL,
              \`description\` text NULL,
              \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
              \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
              UNIQUE INDEX \`IDX_category_name\` (\`name\`),
              UNIQUE INDEX \`IDX_category_code\` (\`code\`),
              PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB;
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`suppliers\` (
              \`id\` varchar(36) NOT NULL,
              \`name\` varchar(255) NOT NULL,
              \`contactPerson\` varchar(255) NULL,
              \`email\` varchar(255) NULL,
              \`phone\` varchar(255) NULL,
              \`address\` varchar(255) NULL,
              \`notes\` varchar(255) NULL,
              \`rating\` int NOT NULL DEFAULT 5,
              \`leadTimeDays\` int NOT NULL DEFAULT 3,
              \`isDeleted\` tinyint NOT NULL DEFAULT 0,
              \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
              \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
              PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB;
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`warehouses\` (
              \`id\` varchar(36) NOT NULL,
              \`name\` varchar(255) NOT NULL,
              \`code\` varchar(255) NOT NULL,
              \`address\` varchar(255) NULL,
              \`isPrimary\` tinyint NOT NULL DEFAULT 0,
              \`isDeleted\` tinyint NOT NULL DEFAULT 0,
              \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
              \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
              PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB;
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`products\` (
              \`id\` varchar(36) NOT NULL,
              \`name\` varchar(255) NOT NULL,
              \`sku\` varchar(255) NOT NULL,
              \`categoryId\` varchar(36) NULL,
              \`supplierId\` varchar(36) NULL,
              \`price\` decimal(10,2) NOT NULL DEFAULT '0.00',
              \`quantity\` int NOT NULL DEFAULT 0,
              \`minQuantity\` int NOT NULL DEFAULT 5,
              \`status\` varchar(255) NOT NULL DEFAULT 'In stock',
              \`imageUrl\` varchar(255) NULL,
              \`unit\` varchar(255) NOT NULL DEFAULT 'Adet',
              \`warehouses\` json NULL,
              \`isDeleted\` tinyint NOT NULL DEFAULT 0,
              \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
              \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
              PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB;
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`orders\` (
              \`id\` varchar(36) NOT NULL,
              \`orderNumber\` varchar(255) NOT NULL,
              \`customerName\` varchar(255) NOT NULL,
              \`date\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
              \`totalAmount\` decimal(10,2) NOT NULL DEFAULT '0.00',
              \`status\` varchar(255) NOT NULL DEFAULT 'Pending',
              \`itemCount\` int NOT NULL DEFAULT 0,
              \`paymentMethod\` varchar(255) NOT NULL DEFAULT 'Havale / EFT',
              \`carrier\` varchar(255) NULL,
              \`trackingNumber\` varchar(255) NULL,
              \`notes\` text NULL,
              \`deletedAt\` datetime(6) NULL,
              \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
              \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
              PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB;
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`order_items\` (
              \`id\` varchar(36) NOT NULL,
              \`orderId\` varchar(36) NOT NULL,
              \`productId\` varchar(36) NULL,
              \`productName\` varchar(255) NOT NULL,
              \`quantity\` int NOT NULL DEFAULT 1,
              \`price\` decimal(10,2) NOT NULL DEFAULT '0.00',
              PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB;
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`purchase_orders\` (
              \`id\` varchar(36) NOT NULL,
              \`poNumber\` varchar(255) NOT NULL,
              \`supplierId\` varchar(36) NULL,
              \`supplierName\` varchar(255) NOT NULL,
              \`status\` varchar(255) NOT NULL DEFAULT 'Draft',
              \`totalAmount\` decimal(10,2) NOT NULL DEFAULT '0.00',
              \`expectedDate\` varchar(255) NULL,
              \`notes\` varchar(255) NULL,
              \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
              \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
              PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB;
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`purchase_order_items\` (
              \`id\` varchar(36) NOT NULL,
              \`purchaseOrderId\` varchar(36) NOT NULL,
              \`productId\` varchar(36) NULL,
              \`productName\` varchar(255) NOT NULL,
              \`quantity\` int NOT NULL DEFAULT 1,
              \`price\` decimal(10,2) NOT NULL DEFAULT '0.00',
              PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB;
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`stock_movements\` (
              \`id\` varchar(36) NOT NULL,
              \`productId\` varchar(36) NULL,
              \`productName\` varchar(255) NOT NULL,
              \`type\` varchar(255) NOT NULL,
              \`quantity\` int NOT NULL,
              \`previousQuantity\` int NOT NULL,
              \`newQuantity\` int NOT NULL,
              \`referenceId\` varchar(255) NULL,
              \`referenceType\` varchar(255) NULL,
              \`note\` varchar(255) NULL,
              \`performedBy\` varchar(255) NULL,
              \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
              PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB;
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`stock_counts\` (
              \`id\` varchar(36) NOT NULL,
              \`countNumber\` varchar(255) NOT NULL,
              \`status\` varchar(255) NOT NULL DEFAULT 'InProgress',
              \`startedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
              \`completedAt\` datetime NULL,
              \`items\` json NULL,
              \`notes\` varchar(255) NULL,
              \`performedBy\` varchar(255) NOT NULL DEFAULT 'System',
              \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
              PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB;
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`product_warehouse_stocks\` (
              \`id\` varchar(36) NOT NULL,
              \`productId\` varchar(36) NOT NULL,
              \`warehouseId\` varchar(36) NOT NULL,
              \`quantity\` int NOT NULL DEFAULT 0,
              PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB;
        `);

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS \`users\` (
              \`id\` varchar(36) NOT NULL,
              \`username\` varchar(255) NOT NULL,
              \`password\` varchar(255) NOT NULL,
              \`role\` varchar(255) NOT NULL DEFAULT 'viewer',
              \`fullName\` varchar(255) NOT NULL,
              \`email\` varchar(255) NULL,
              \`department\` varchar(255) NULL,
              \`avatar\` longtext NULL,
              \`tokenVersion\` int NOT NULL DEFAULT 0,
              \`subscriptionPlan\` varchar(255) NOT NULL DEFAULT 'Standard',
              \`subscriptionExpiresAt\` datetime NULL,
              \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
              \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
              PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB;
        `);

        // Alterations & Foreign key constraints
        await queryRunner.query(`ALTER TABLE \`suppliers\` CHANGE \`contactPerson\` \`contactPerson\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`suppliers\` CHANGE \`email\` \`email\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`suppliers\` CHANGE \`phone\` \`phone\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`suppliers\` CHANGE \`address\` \`address\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`suppliers\` CHANGE \`notes\` \`notes\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`warehouses\` CHANGE \`address\` \`address\` varchar(255) NULL`);
        
        // Product FKs
        try { await queryRunner.query(`ALTER TABLE \`products\` DROP FOREIGN KEY \`FK_ff56834e735fa78a15d0cf21926\``); } catch (e) {}
        try { await queryRunner.query(`ALTER TABLE \`products\` DROP FOREIGN KEY \`FK_c143cbc0299e1f9220c4b5debd8\``); } catch (e) {}
        await queryRunner.query(`ALTER TABLE \`products\` CHANGE \`categoryId\` \`categoryId\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`products\` CHANGE \`supplierId\` \`supplierId\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`products\` CHANGE \`imageUrl\` \`imageUrl\` varchar(255) NULL`);
        
        // Orders & Order Items
        try { await queryRunner.query(`ALTER TABLE \`order_items\` DROP FOREIGN KEY \`FK_cdb99c05982d5191ac8465ac010\``); } catch (e) {}
        await queryRunner.query(`ALTER TABLE \`order_items\` CHANGE \`productId\` \`productId\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`orders\` CHANGE \`date\` \`date\` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE \`orders\` CHANGE \`carrier\` \`carrier\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`orders\` CHANGE \`trackingNumber\` \`trackingNumber\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`orders\` CHANGE \`deletedAt\` \`deletedAt\` datetime(6) NULL`);
        
        // Stock Movements
        await queryRunner.query(`ALTER TABLE \`stock_movements\` CHANGE \`referenceId\` \`referenceId\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`stock_movements\` CHANGE \`referenceType\` \`referenceType\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`stock_movements\` CHANGE \`note\` \`note\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`stock_movements\` CHANGE \`performedBy\` \`performedBy\` varchar(255) NULL`);
        
        // Purchase Orders & Items
        try { await queryRunner.query(`ALTER TABLE \`purchase_order_items\` DROP FOREIGN KEY \`FK_f87b1b82a3aff16d1cb5e49a656\``); } catch (e) {}
        await queryRunner.query(`ALTER TABLE \`purchase_order_items\` CHANGE \`productId\` \`productId\` varchar(255) NULL`);
        try { await queryRunner.query(`ALTER TABLE \`purchase_orders\` DROP FOREIGN KEY \`FK_0c3ff892a9f2ed16f59d31cccae\``); } catch (e) {}
        await queryRunner.query(`ALTER TABLE \`purchase_orders\` CHANGE \`supplierId\` \`supplierId\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`purchase_orders\` CHANGE \`expectedDate\` \`expectedDate\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`purchase_orders\` CHANGE \`notes\` \`notes\` varchar(255) NULL`);
        
        // Stock Counts & Users
        await queryRunner.query(`ALTER TABLE \`stock_counts\` CHANGE \`completedAt\` \`completedAt\` datetime NULL`);
        await queryRunner.query(`ALTER TABLE \`stock_counts\` CHANGE \`notes\` \`notes\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`email\` \`email\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`department\` \`department\` varchar(255) NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`avatar\` \`avatar\` longtext NULL`);
        await queryRunner.query(`ALTER TABLE \`users\` CHANGE \`subscriptionExpiresAt\` \`subscriptionExpiresAt\` datetime NULL`);
        
        // Foreign Key Constraints
        try { await queryRunner.query(`ALTER TABLE \`products\` ADD CONSTRAINT \`FK_ff56834e735fa78a15d0cf21926\` FOREIGN KEY (\`categoryId\`) REFERENCES \`categories\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`); } catch (e) {}
        try { await queryRunner.query(`ALTER TABLE \`products\` ADD CONSTRAINT \`FK_c143cbc0299e1f9220c4b5debd8\` FOREIGN KEY (\`supplierId\`) REFERENCES \`suppliers\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`); } catch (e) {}
        try { await queryRunner.query(`ALTER TABLE \`order_items\` ADD CONSTRAINT \`FK_cdb99c05982d5191ac8465ac010\` FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`); } catch (e) {}
        try { await queryRunner.query(`ALTER TABLE \`purchase_order_items\` ADD CONSTRAINT \`FK_f87b1b82a3aff16d1cb5e49a656\` FOREIGN KEY (\`productId\`) REFERENCES \`products\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`); } catch (e) {}
        try { await queryRunner.query(`ALTER TABLE \`purchase_orders\` ADD CONSTRAINT \`FK_0c3ff892a9f2ed16f59d31cccae\` FOREIGN KEY (\`supplierId\`) REFERENCES \`suppliers\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`); } catch (e) {}
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revert actions if needed
    }
}
