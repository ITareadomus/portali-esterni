-- ADAM tenant layer sopra il database legacy single-organization.
-- Better Auth Organization resta layer auth/profilazione.
-- adm_tenant e' lo scope dati dominio ADAM.
-- I login legacy app_employees/app_users/app_customers restano separati.

CREATE TABLE `adm_tenant` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `organizationId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `adm_tenant_slug_key`(`slug`),
    UNIQUE INDEX `adm_tenant_organizationId_key`(`organizationId`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `adm_tenant` (`id`, `name`, `slug`, `createdAt`, `updatedAt`)
VALUES (1, 'AD Premium', 'adam-legacy', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

ALTER TABLE `app_employees`
    ADD COLUMN `adm_tenant_id` INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE `app_users`
    ADD COLUMN `adm_tenant_id` INT UNSIGNED NOT NULL DEFAULT 1;

ALTER TABLE `app_customers`
    ADD COLUMN `adm_tenant_id` INT UNSIGNED NOT NULL DEFAULT 1;

CREATE INDEX `app_employees_adm_tenant_id_idx`
    ON `app_employees`(`adm_tenant_id`);

CREATE INDEX `app_users_adm_tenant_id_idx`
    ON `app_users`(`adm_tenant_id`);

CREATE INDEX `app_customers_adm_tenant_id_idx`
    ON `app_customers`(`adm_tenant_id`);

ALTER TABLE `adm_tenant`
    ADD CONSTRAINT `adm_tenant_organizationId_fkey`
    FOREIGN KEY (`organizationId`) REFERENCES `adm_organization`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `app_employees`
    ADD CONSTRAINT `app_employees_adm_tenant_id_fkey`
    FOREIGN KEY (`adm_tenant_id`) REFERENCES `adm_tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `app_users`
    ADD CONSTRAINT `app_users_adm_tenant_id_fkey`
    FOREIGN KEY (`adm_tenant_id`) REFERENCES `adm_tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `app_customers`
    ADD CONSTRAINT `app_customers_adm_tenant_id_fkey`
    FOREIGN KEY (`adm_tenant_id`) REFERENCES `adm_tenant`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
