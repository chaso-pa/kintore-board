-- CreateTable
CREATE TABLE `deleted_workouts` (
    `id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `deleted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `deleted_workouts_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `workouts_user_id_trained_on_id_idx` ON `workouts`(`user_id`, `trained_on`, `id`);

