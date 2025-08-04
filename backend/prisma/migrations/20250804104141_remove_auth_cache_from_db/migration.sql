/*
  Warnings:

  - You are about to drop the column `authenticationCache` on the `MinecraftAccount` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "MinecraftAccount" DROP COLUMN "authenticationCache";
