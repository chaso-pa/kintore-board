/*
  Warnings:

  - You are about to drop the column `gym_id` on the `machines` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `machines` DROP FOREIGN KEY `machines_gym_id_fkey`;

-- DropIndex
DROP INDEX `machines_gym_id_fkey` ON `machines`;

-- AlterTable
ALTER TABLE `machines` DROP COLUMN `gym_id`;
