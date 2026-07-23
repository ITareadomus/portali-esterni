-- Customer portal remember-me tokens.
-- Non modifica app_customers.remember_token legacy.
-- Ogni riga rappresenta un browser/profilo/dispositivo ricordato per un cliente.
-- Salvare solo digest/HMAC del token, mai il token in chiaro.

CREATE TABLE IF NOT EXISTS `app_customer_remember_tokens` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `customer_id` INT UNSIGNED NOT NULL,
    `adm_tenant_id` INT UNSIGNED NOT NULL,
    `selector` CHAR(43) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `user_agent_hash` CHAR(64) DEFAULT NULL,
    `ip_hash` CHAR(64) DEFAULT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_used_at` DATETIME(3) DEFAULT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) DEFAULT NULL,

    PRIMARY KEY (`id`),
    UNIQUE INDEX `app_customer_remember_tokens_selector_key` (`selector`),
    INDEX `app_customer_remember_tokens_customer_idx` (`customer_id`),
    INDEX `app_customer_remember_tokens_tenant_customer_idx` (`adm_tenant_id`, `customer_id`),
    INDEX `app_customer_remember_tokens_expires_idx` (`expires_at`),
    INDEX `app_customer_remember_tokens_revoked_idx` (`revoked_at`),

    CONSTRAINT `app_customer_remember_tokens_customer_fkey`
        FOREIGN KEY (`customer_id`) REFERENCES `app_customers`(`id`)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `app_customer_remember_tokens_adm_tenant_fkey`
        FOREIGN KEY (`adm_tenant_id`) REFERENCES `adm_tenant`(`id`)
        ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
