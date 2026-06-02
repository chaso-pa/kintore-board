-- AlterTable
ALTER TABLE `gyms` ADD COLUMN `barbell_type` VARCHAR(191) NULL,
    ADD COLUMN `dumbbell_max_kg` INTEGER NULL,
    ADD COLUMN `power_rack_count` INTEGER NULL;

-- CreateTable
CREATE TABLE `gym_machines` (
    `gym_id` VARCHAR(191) NOT NULL,
    `machine_id` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`gym_id`, `machine_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `gym_machines` ADD CONSTRAINT `gym_machines_gym_id_fkey` FOREIGN KEY (`gym_id`) REFERENCES `gyms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gym_machines` ADD CONSTRAINT `gym_machines_machine_id_fkey` FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
