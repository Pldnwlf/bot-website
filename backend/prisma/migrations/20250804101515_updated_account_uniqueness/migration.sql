/*
  Warnings:

  - A unique constraint covering the columns `[loginEmail,keycloakUserId]` on the table `MinecraftAccount` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "MinecraftAccount_loginEmail_key";

-- CreateIndex
CREATE UNIQUE INDEX "MinecraftAccount_loginEmail_keycloakUserId_key" ON "MinecraftAccount"("loginEmail", "keycloakUserId");
