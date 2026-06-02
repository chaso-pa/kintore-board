-- CreateTable
CREATE TABLE `thread_bookmarks` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `thread_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `thread_bookmarks_user_id_thread_id_key`(`user_id`, `thread_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `thread_bookmarks` ADD CONSTRAINT `thread_bookmarks_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `thread_bookmarks` ADD CONSTRAINT `thread_bookmarks_thread_id_fkey` FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
