-- Rimuove solo residui dello schema errato precedente.
-- Non tocca app_employees, app_users, app_customers e non cancella dati Better Auth correnti.

SET @current_schema = DATABASE();

SET @drop_fk_sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = @current_schema
        AND TABLE_NAME = 'adm_tenant_profile'
        AND CONSTRAINT_NAME = 'adm_tenant_profile_appTenantId_fkey'
    ),
    'ALTER TABLE `adm_tenant_profile` DROP FOREIGN KEY `adm_tenant_profile_appTenantId_fkey`',
    'SELECT 1'
  )
);
PREPARE drop_fk_stmt FROM @drop_fk_sql;
EXECUTE drop_fk_stmt;
DEALLOCATE PREPARE drop_fk_stmt;

SET @drop_index_sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = @current_schema
        AND TABLE_NAME = 'adm_tenant_profile'
        AND INDEX_NAME = 'adm_tenant_profile_appTenantId_idx'
    ),
    'ALTER TABLE `adm_tenant_profile` DROP INDEX `adm_tenant_profile_appTenantId_idx`',
    'SELECT 1'
  )
);
PREPARE drop_index_stmt FROM @drop_index_sql;
EXECUTE drop_index_stmt;
DEALLOCATE PREPARE drop_index_stmt;

SET @drop_column_sql = (
  SELECT IF(
    EXISTS (
      SELECT 1
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = @current_schema
        AND TABLE_NAME = 'adm_tenant_profile'
        AND COLUMN_NAME = 'appTenantId'
    ),
    'ALTER TABLE `adm_tenant_profile` DROP COLUMN `appTenantId`',
    'SELECT 1'
  )
);
PREPARE drop_column_stmt FROM @drop_column_sql;
EXECUTE drop_column_stmt;
DEALLOCATE PREPARE drop_column_stmt;

DROP TABLE IF EXISTS `adm_app_tenant`;
