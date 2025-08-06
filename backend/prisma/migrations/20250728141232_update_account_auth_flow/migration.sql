/*
  Warnings:

  - You are about to drop the column `authProfile` on the `BotSession` table. All the data in the column will be lost.
  - You are about to drop the column `encryptedPassword` on the `MinecraftAccount` table. All the data in the column will be lost.
  - You are about to drop the column `iv` on the `MinecraftAccount` table. All the data in the column will be lost.
  - Made the column `keycloakUserId` on table `MinecraftAccount` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED');

-- DropForeignKey
ALTER TABLE "BotSession" DROP CONSTRAINT "BotSession_accountId_fkey";

-- AlterTable
ALTER TABLE "BotSession" DROP COLUMN "authProfile";

-- AlterTable
ALTER TABLE "MinecraftAccount" DROP COLUMN "encryptedPassword",
DROP COLUMN "iv",
ADD COLUMN     "authenticationCache" JSONB,
ADD COLUMN     "status" "AccountStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
ALTER COLUMN "keycloakUserId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "MinecraftAccount_keycloakUserId_idx" ON "MinecraftAccount"("keycloakUserId");

-- AddForeignKey
ALTER TABLE "BotSession" ADD CONSTRAINT "BotSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MinecraftAccount"("accountId") ON DELETE CASCADE ON UPDATE CASCADE;
