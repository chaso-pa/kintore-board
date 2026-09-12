-- CreateTable
CREATE TABLE `user_blocks` (
    `id` VARCHAR(191) NOT NULL,
    `blocker_user_id` VARCHAR(191) NOT NULL,
    `blocked_user_id` VARCHAR(191) NOT NULL,
    `source_excerpt` VARCHAR(80) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_blocks_blocked_user_id_idx`(`blocked_user_id`),
    UNIQUE INDEX `user_blocks_blocker_user_id_blocked_user_id_key`(`blocker_user_id`, `blocked_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_blocks` ADD CONSTRAINT `user_blocks_blocker_user_id_fkey` FOREIGN KEY (`blocker_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_blocks` ADD CONSTRAINT `user_blocks_blocked_user_id_fkey` FOREIGN KEY (`blocked_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
