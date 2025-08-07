// =========================================================================
// IMPORTS UND GRUNDEINSTELLUNGEN
// =========================================================================
import dotenv from 'dotenv';
dotenv.config();
import Keycloak from 'keycloak-connect';
import cors from 'cors';
import session from 'express-session';
import express from 'express';
import { PrismaClient } from '@prisma/client';
import * as mineflayer from 'mineflayer';
import { Bot } from 'mineflayer';
import { WebSocketServer } from 'ws';
import http from 'http';
import logger from './logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { readdir, mkdir, rename, readFile } from "node:fs/promises";

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;
const logindelay = parseInt(process.env.LOGINDELAY || "2000");

const msaCachePath = path.join(process.cwd(), 'msa');

const msaProfilesPath = path.join(process.cwd(), 'msa/profiles');

const activeBots: Map<string, Bot> = new Map();
// Speichert Bots, die auf die MS-Authentifizierung durch den Benutzer warten.
const pendingAuthenticationBots: Map<string, { bot: Bot, timeoutId: NodeJS.Timeout, pollerId?: NodeJS.Timeout }> = new Map();

// =========================================================================
// SERVER UND WEBSOCKET INITIALISIERUNG
// =========================================================================
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(data: any) {
    const jsonData = JSON.stringify(data);
    logger.info(`BROADCAST: ${jsonData}`);
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) client.send(jsonData);
    });
}

// Healh Check endpoint
app.get('/healthz', (req, res) => {
    res.status(200).send('OK');
});


// =========================================================================
// MIDDLEWARE (unverändert)
// =========================================================================
const memoryStore = new session.MemoryStore();
const keycloak = new Keycloak({ store: memoryStore });
app.use(express.json());
app.use(cors({ origin: 'http://localhost:4200' }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'bitte-in-der-env-aendern',
    resave: false,
    saveUninitialized: true,
    store: memoryStore
}));
app.use(keycloak.middleware());

// =========================================================================
// HELFERFUNKTIONEN
// =========================================================================

async function allFilesHaveDataInMsaFolder(): Promise<boolean> {
    const folderPath = path.join(process.cwd(), 'msa');
    try {
        const entries = await readdir(folderPath, { withFileTypes: true });
        const files = entries.filter(entry => entry.isFile());

        for (const file of files) {
            const sourcePath = path.join(folderPath, file.name);
            try {
                const data = await readFile(sourcePath, 'utf8');
                if (data.trim().length <= 5) {
                    logger.warn(`File ${file.name} is empty or invalid.`);
                    return false;
                }
            } catch (err) {
                logger.error(`Error while reading File: ${file.name}:`, err);
                return false;
            }
        }
        logger.info(`All files have invalid data.`);
        return true;
    } catch (err) {
        logger.error(`error while reading folder: ${folderPath}:`, err);
        return false;
    }
}

async function moveCacheToStorage(): Promise<void> {
    const baseFolder = path.join(process.cwd(), 'msa');
    const targetFolder = path.join(baseFolder, 'profiles');

    const allValid = await allFilesHaveDataInMsaFolder();
    if (!allValid) {
        logger.warn("Not all files have data. Stop Procedure");
        return;
    }

    try {
        await mkdir(targetFolder, { recursive: true });
        logger.info(`Created Directory: ${targetFolder}`);

        const entries = await readdir(baseFolder, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isFile()) {
                const sourcePath = path.join(baseFolder, entry.name);
                const targetPath = path.join(targetFolder, entry.name);

                try {
                    await rename(sourcePath, targetPath);
                    logger.info(`Moved: ${entry.name}`);
                } catch (renameErr) {
                    logger.error(`Error while moving ${entry.name}:`, renameErr);
                }
            }
        }
    } catch (err) {
        logger.error('Error while reading MsaFolder:', err);
    }
}

// =========================================================================
// KERNLOGIK: BOT-LEBENSZYKLUS (unverändert)
// =========================================================================
async function createBotInstance(accountId: string, loginEmail: string, options: { host: string; port: number, version?: string | false }) {
    const logMeta = { accountId, loginEmail };
    logger.info(`Preparing to start bot instance for ${loginEmail}`, logMeta);


    const bot = mineflayer.createBot({
        username: loginEmail,
        auth: 'microsoft',
        version: options.version || "1.21.4",
        host: options.host,
        port: options.port,
        profilesFolder: msaProfilesPath,
        hideErrors: false
    });
    activeBots.set(accountId, bot);

    bot.once('login', async () => {
        logger.info(`Bot ${bot.username} logged in successfully.`, logMeta);
        await prisma.minecraftAccount.update({
            where: { accountId },
            data: { ingameName: bot.username }
        }).catch(()=>{});
        await prisma.botSession.update({ where: { accountId }, data: { status: 'connecting', isActive: true, lastSeenAt: new Date() } }).catch(()=>{});
        broadcast({ type: 'status_update', payload: { accountId, status: `Logged in as ${bot.username}` } });
    });

    bot.once('spawn', async () => {
        logger.info(`Bot ${bot.username} spawned on ${options.host}.`, logMeta);
        await prisma.botSession.update({
            where: { accountId },
            data: { status: 'online_on_server', lastKnownServerAddress: options.host, lastKnownServerPort: options.port, lastKnownVersion: options.version || null }
        }).catch(()=>{});
        broadcast({ type: 'status_update', payload: { accountId, status: `Online on ${options.host}` } });
    });

    bot.on('kicked', (reason) => {
        broadcast({ type: 'bot_kicked', payload: { accountId, reason: JSON.stringify(reason) } });
    });
    bot.on('error', (err) => {
        broadcast({ type: 'bot_error', payload: { accountId, error: err.message } });
    });

    bot.once('end', async (reason) => {
        activeBots.delete(accountId);
        await prisma.botSession.update({ where: { accountId }, data: { status: 'offline', isActive: false } }).catch(()=>{});
        broadcast({ type: 'status_update', payload: { accountId, status: 'offline' } });
        logger.info(`Bot ${bot.username} disconnected. Reason: ${reason || 'Unknown'}`, logMeta);
    });
}


// =========================================================================
// API ENDPUNKTE
// =========================================================================

async function cleanupPendingBot(accountId: string, options: { deleteFromDB?: boolean } = {}) {
    const pending = pendingAuthenticationBots.get(accountId);
    if (pending) {
        clearTimeout(pending.timeoutId);
        if (pending.pollerId) {
            clearInterval(pending.pollerId);
        }

        // PRÜFEN, ob die quit-Methode existiert, bevor sie aufgerufen wird
        if (pending.bot && typeof pending.bot.quit === 'function') {
            pending.bot.quit();
        }

        pendingAuthenticationBots.delete(accountId);
        logger.info(`Cleaned up pending authentication bot for account ${accountId}.`);
        if (options.deleteFromDB) {
            await prisma.minecraftAccount.delete({ where: { accountId } })
                .catch(e => logger.error(`Failed to delete PENDING account ${accountId} during cleanup.`, { error: e }));
        }
    }
}

app.post('/api/accounts/initiate-add', keycloak.protect(), async (req: any, res) => {
    const { loginEmail } = req.body;
    const keycloakUserId = req.kauth.grant.access_token.content.sub;
    logger.info(`[1/4] Received 'initiate-add' request for email: ${loginEmail}`);

    const existingAccount = await prisma.minecraftAccount.findUnique({ where: { loginEmail_keycloakUserId: { loginEmail, keycloakUserId } } });
    if (existingAccount) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    let account;
    try {
        account = await prisma.minecraftAccount.create({
            data: { loginEmail, keycloakUserId, status: 'PENDING_VERIFICATION', session: { create: {} } },
        });
        logger.info(`[2/4] Created PENDING account in DB: ${account.accountId}`);
    } catch (e: any) {
        return res.status(500).json({ error: 'Database error.' });
    }

    const { accountId } = account;
    let pollerId: NodeJS.Timeout | undefined;

    const timeoutId = setTimeout(() => {
        logger.warn(`Authentication for ${loginEmail} (accountId: ${accountId}) timed out. Cleaning up.`);
        cleanupPendingBot(accountId, { deleteFromDB: true });
    }, 300000);

    try {
        const bot = mineflayer.createBot({
            username: loginEmail,
            auth: 'microsoft',
            skipValidation: true,
            profilesFolder: msaCachePath,
            hideErrors: true,
            onMsaCode: (data) => {
                logger.info(`[3/4] Microsoft device code received for ${loginEmail}. Sending to frontend.`);
                if (!res.headersSent) {
                    res.status(200).json({
                        accountId: accountId,
                        auth: { url: data.verification_uri, code: data.user_code }
                    });
                }

                logger.info(`[3.5/4] Waiting for user to complete login. Polling for cache file: ${msaCachePath}`);
                pollerId = setInterval(async () => {
                    if (await allFilesHaveDataInMsaFolder()){
                        logger.info(`[4/4] Cache files found! Finalizing account ${accountId}.`);
                        if (pollerId) clearInterval(pollerId);
                        await prisma.minecraftAccount.update({
                            where: { accountId },
                            data: { status: 'ACTIVE' }
                        });
                        await moveCacheToStorage()

                        broadcast({ type: 'accounts_updated' });
                        logger.info(`Account ${accountId} finalized and set to ACTIVE. Cache moved to ${msaProfilesPath}`);

                        cleanupPendingBot(accountId);
                    }

                }, 5000);
                const pending = pendingAuthenticationBots.get(accountId);
                if (pending) pending.pollerId = pollerId;
            }
        });

        // Speichere den Bot und den Timeout in der Map.
        pendingAuthenticationBots.set(accountId, { bot, timeoutId });

    } catch (error: any) {
        logger.error(`[FATAL] Failed to create bot for auth process for ${loginEmail}.`, { error });
        cleanupPendingBot(accountId, { deleteFromDB: true });
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to initiate the authentication process.' });
        }
    }
});

app.get('/api/accounts', keycloak.protect(), async (req: any, res) => {
    const keycloakUserId = req.kauth.grant.access_token.content.sub;
    try {
        const accounts = await prisma.minecraftAccount.findMany({
            where: { keycloakUserId },
            select: { accountId: true, loginEmail: true, ingameName: true, status: true, session: { select: { status: true, lastKnownServerAddress: true } } },
            orderBy: { createdAt: 'asc' }
        });
        res.json(accounts);
    } catch (error) { logger.error('Failed to fetch accounts', { error }); res.status(500).json({ error: 'Internal server error' }); }
});

app.post('/api/bots/start', keycloak.protect(), async (req: any, res) => {
    const { accountIds, serverAddress, accountVersion } = req.body;
    const keycloakUserId = req.kauth.grant.access_token.content.sub;
    if (!accountIds || !Array.isArray(accountIds) || !serverAddress) {
        return res.status(400).json({ error: 'accountIds and serverAddress are required.' });
    }
    const [host, portStr] = serverAddress.split(':');
    const port = portStr ? parseInt(portStr, 10) : 25565;

    for (const accountId of accountIds) {
        if (activeBots.has(accountId)) continue;
        const account = await prisma.minecraftAccount.findFirst({
            where: { accountId, keycloakUserId, status: 'ACTIVE' }
        });
        if (account) {
            createBotInstance(accountId, account.loginEmail, { host, port, version: accountVersion || false })
                .catch(err => logger.error(`Failed to start bot instance for ${accountId}`, { error: err }));
        } else {
            logger.warn(`Could not start bot for account ${accountId}: Not found or not active.`);
        }
        await new Promise(resolve => setTimeout(resolve, logindelay));
    }
    res.status(202).json({ message: 'Start command sent.' });
});

app.post('/api/bots/stop', keycloak.protect(), async (req: any, res) => {
    const { accountIds } = req.body;
    for (const accountId of accountIds) {
        activeBots.get(accountId)?.quit();
    }
    res.status(202).json({ message: 'Stop command sent.' });
});

app.delete('/api/accounts/:accountId', keycloak.protect(), async (req: any, res) => {
    const { accountId } = req.params;
    const keycloakUserId = req.kauth.grant.access_token.content.sub;

    activeBots.get(accountId)?.quit();
    await cleanupPendingBot(accountId);

    try {
        await prisma.minecraftAccount.delete({ where: { accountId, keycloakUserId } });
        logger.info(`Account ${accountId} and its cache file deleted.`);
        //TODO - Nimm das neue Cachefile und speicehre die vordere ID in die db mit dem account damit du nachher die gespeicehrten Cache files löschen kansnt.
        broadcast({ type: 'accounts_updated' });
        res.status(204).send();
    } catch (error) {
        logger.error(`Failed to delete account ${accountId}`, { error });
        res.status(500).json({ error: 'Failed to delete account.' });
    }
});


// SERVER START UND GRACEFUL SHUTDOWN
async function main() {
    await fs.mkdir(msaCachePath, { recursive: true });
    await fs.mkdir(msaProfilesPath, { recursive: true });
    logger.info('Cache directory ready. Skipping cleanup on startup to preserve permanent caches.');

    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    signals.forEach((signal) => {
        process.on(signal, async () => {
            logger.info(`\n🚨 Received ${signal}, initiating graceful shutdown...`);
            wss.close();
            for (const bot of activeBots.values()) {
                bot.quit();
            }
            for (const accountId of pendingAuthenticationBots.keys()) {
                await cleanupPendingBot(accountId, {deleteFromDB: true})
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
            await prisma.$disconnect();
            logger.info('🗃️ Disconnected from database.');
            server.close(() => {
                logger.info('✅ Shutdown complete. Exiting.');
                process.exit(0);
            });
        });
    });

    server.listen(PORT, () => {
        logger.info(`🚀 Server listening on http://localhost:${PORT}`);
    });
}


main().catch(e => {
    logger.error("Fatal error during startup:", { error: e });
    prisma.$disconnect();
    process.exit(1);
});