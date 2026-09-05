-- AlterTable
ALTER TABLE `reports` ADD COLUMN `detail` TEXT NULL;

-- CreateIndex
CREATE INDEX `reports_status_created_at_idx` ON `reports`(`status`, `created_at`);

-- CreateIndex
CREATE INDEX `reports_target_type_target_id_idx` ON `reports`(`target_type`, `target_id`);

-- CreateIndex
CREATE UNIQUE INDEX `reports_reported_by_user_id_target_type_target_id_key` ON `reports`(`reported_by_user_id`, `target_type`, `target_id`);

