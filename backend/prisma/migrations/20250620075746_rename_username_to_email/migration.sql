-- CreateTable
CREATE TABLE "MinecraftAccount" (
    "accountId" TEXT NOT NULL,
    "keycloakUserId" TEXT,
    "loginEmail" TEXT NOT NULL,
    "ingameName" TEXT,
    "encryptedPassword" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MinecraftAccount_pkey" PRIMARY KEY ("accountId")
);

-- CreateTable
CREATE TABLE "BotSession" (
    "sessionId" TEXT NOT NULL,
    "lastKnownServerAddress" TEXT,
    "lastKnownServerPort" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "BotSession_pkey" PRIMARY KEY ("sessionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "MinecraftAccount_loginEmail_key" ON "MinecraftAccount"("loginEmail");

-- CreateIndex
CREATE UNIQUE INDEX "BotSession_accountId_key" ON "BotSession"("accountId");

-- AddForeignKey
ALTER TABLE "BotSession" ADD CONSTRAINT "BotSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "MinecraftAccount"("accountId") ON DELETE RESTRICT ON UPDATE CASCADE;
