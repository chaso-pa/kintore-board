-- AlterTable
ALTER TABLE `gyms` ADD COLUMN `has_locker_room` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `has_parking` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `has_shower` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `hours` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `gym_edit_requests` (
    `id` VARCHAR(191) NOT NULL,
    `gym_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `gym_edit_requests` ADD CONSTRAINT `gym_edit_requests_gym_id_fkey` FOREIGN KEY (`gym_id`) REFERENCES `gyms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gym_edit_requests` ADD CONSTRAINT `gym_edit_requests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
