// =========================================================================
// IMPORTS UND GRUNDEINSTELLUNGEN
// =========================================================================
import dotenv from 'dotenv';
dotenv.config();
import Keycloak from 'keycloak-connect';
import cors from 'cors';
import session from 'express-session';
import express from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import * as mineflayer from 'mineflayer';
import { Bot } from 'mineflayer';
import { WebSocketServer } from 'ws';
import http from 'http';
import logger from './logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Authflow, Titles } from 'prismarine-auth';
import { createHash } from 'crypto';

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;
const logindelay = parseInt(process.env.LOGINDELAY || "20000");

const msaFolderPath = path.join(process.cwd(), 'msa');

const activeBots: Map<string, Bot> = new Map();
const pendingAuthenticationBots: Map<string, Bot> = new Map();

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

// =========================================================================
// MIDDLEWARE
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
//  HELFERFUNKTION: Kapselt die Logik zum Holen des Links
// =========================================================================
// async function getMicrosoftAuthLink(email: string): Promise<{ user_code: string, verification_uri: string }> {
//     return new Promise((resolve, reject) => {
//         const codeCallback = (data: any) => {
//             logger.info(`[prismarine-auth] Device code received via codeCallback for ${email}`);
//             resolve(data);
//         };
//
//         const authflow = new Authflow(
//             email,                        // 1. username
//             msaFolderPath,                // 2. cache
//             {                             // 3. options-Objekt
//                 authTitle: Titles.MinecraftJava,
//                 flow: 'msal'
//             },
//             codeCallback                  // 4. codeCallback-Funktion
//         );
//
//         authflow.getMsaToken().catch((err) => {
//             if (err) {
//                 logger.error(`[prismarine-auth] Error triggering MSA token flow: ${err.message}`, { error: err });
//                 reject(err);
//             }
//         });
//     });
// }



// =========================================================================
// HELFERFUNKTIONEN FÜR CACHE-MANAGEMENT
// =========================================================================
async function writeCacheFile(accountId: string, cacheData: Prisma.JsonValue): Promise<string> {
    const profilePath = path.join(msaFolderPath, `${accountId}.json`);
    await fs.writeFile(profilePath, JSON.stringify(cacheData, null, 2));
    return profilePath;
}

async function readCacheFile(profilePath: string): Promise<Prisma.JsonValue> {
    try {
        const fileContent = await fs.readFile(profilePath, 'utf-8');
        return JSON.parse(fileContent);
    } catch (error) {
        logger.error(`Could not read or parse cache file at ${profilePath}`, { error });
        return {};
    }
}

// =========================================================================
// KERNLOGIK: BOT-LEBENSZYKLUS
// =========================================================================
async function createBotInstance(accountId: string, loginEmail: string, authCache: Prisma.JsonValue, options: { host: string; port: number, version?: string | false }) {
    const logMeta = { accountId, loginEmail };
    logger.info(`Starting bot instance for ${loginEmail}`, logMeta);

    const profilePath = await writeCacheFile(accountId, authCache);

    const bot = mineflayer.createBot({
        username: loginEmail,
        auth: 'microsoft',
        version: options.version || "1.21",
        host: options.host,
        port: options.port,
        profilesFolder: msaFolderPath,
        hideErrors: false
    });
    activeBots.set(accountId, bot);

    bot.once('login', async () => {
        logger.info(`Bot ${bot.username} logged in successfully.`, logMeta);
        const updatedCache = await readCacheFile(profilePath);
        if (updatedCache && typeof updatedCache === 'object' && !Array.isArray(updatedCache)) {
            await prisma.minecraftAccount.update({
                where: { accountId },
                data: {
                    ingameName: bot.username,
                    authenticationCache: updatedCache,
                    status: 'ACTIVE'
                }
            });
        }
        await prisma.botSession.update({ where: { accountId }, data: { status: 'connecting', isActive: true, lastSeenAt: new Date() } });
        broadcast({ type: 'status_update', payload: { accountId, status: `Logged in as ${bot.username}` } });
    });

    bot.once('spawn', async () => {
        logger.info(`Bot ${bot.username} spawned on ${options.host}.`, logMeta);
        await prisma.botSession.update({
            where: { accountId },
            data: { status: 'online_on_server', lastKnownServerAddress: options.host, lastKnownServerPort: options.port, lastKnownVersion: options.version || null }
        });
        broadcast({ type: 'status_update', payload: { accountId, status: `Online on ${options.host}` } });
    });

    bot.on('kicked', async (reason) => {
        (bot as any).wasKicked = true;
        const parsedReason = typeof reason === 'string' ? reason : JSON.stringify(reason);
        logger.warn(`Bot ${bot.username} was kicked. Reason: ${parsedReason}`, logMeta);
        broadcast({ type: 'bot_kicked', payload: { accountId, reason: parsedReason } });
    });

    bot.on('error', async (err) => {
        logger.error(`Bot error for ${loginEmail}: ${err.message}`, { ...logMeta, error: err });
        broadcast({ type: 'bot_error', payload: { accountId, error: err.message } });
    });

    bot.once('end', async (reason) => {
        activeBots.delete(accountId);
        await prisma.botSession.update({ where: { accountId }, data: { status: 'offline', isActive: false } });
        broadcast({ type: 'status_update', payload: { accountId, status: 'offline' } });
        await fs.unlink(profilePath).catch(err => logger.warn(`Could not clean up temp file ${profilePath}`, { error: err }));
        logger.info(`Bot ${bot.username} disconnected. Reason: ${reason || 'Unknown'}`, logMeta);
    });
}

// =========================================================================
// API ENDPUNKTE
// =========================================================================

app.post('/api/accounts/initiate-add', keycloak.protect(), async (req: any, res) => {
    const { loginEmail } = req.body;
    const keycloakUserId = req.kauth.grant.access_token.content.sub;
    logger.info(`[1/3] Received 'initiate-add' request for email: ${loginEmail}`);

    try {
        const MS_CLIENT_ID = process.env.MS_CLIENT_ID;
        if (!MS_CLIENT_ID) throw new Error("Microsoft Client ID (MS_CLIENT_ID) is not configured in .env file.");

        // Wir erstellen den PENDING-Account zuerst, um Race Conditions zu vermeiden.
        const account = await prisma.minecraftAccount.create({
            data: { loginEmail, keycloakUserId, status: 'PENDING_VERIFICATION', session: { create: {} } },
        });
        logger.info(`[2/3] Created PENDING account: ${account.accountId}.`);

        const authData = await new Promise<{ code: string, url: string }>((resolve, reject) => {
            // WICHTIG: Wir verwenden hier die `prismarine-auth`-Bibliothek direkt, weil sie uns die saubere Callback-API gibt.
            const authflow = new Authflow(loginEmail, msaFolderPath, {
                msalConfig: { auth: { clientId: MS_CLIENT_ID, authority: 'https://login.microsoftonline.com/common' } }
            }, (data) => resolve({ code: data.user_code, url: data.verification_uri }));

            authflow.getMsaToken().catch(reject);
            setTimeout(() => reject(new Error('Authentication process timed out.')), 60000); // 60s Timeout
        });

        logger.info(`[3/3] Successfully retrieved auth data. Sending to frontend.`);
        res.status(200).json({ accountId: account.accountId, auth: authData });

    } catch (error: any) {
        logger.error(`Failed during initiate-add`, { error: error.message });
        if (error.code === 'P2002') return res.status(409).json({ error: 'An account with this email already exists.' });
        // Wenn ein Fehler auftritt, löschen wir den eventuell erstellten PENDING-Account
        if (loginEmail) await prisma.minecraftAccount.delete({ where: { loginEmail } }).catch(()=>{});
        return res.status(500).json({ error: 'Failed to initiate authentication.' });
    }
});

app.post('/api/accounts/finalize-add/:accountId', keycloak.protect(), async (req: any, res) => {
    const { accountId } = req.params;
    const keycloakUserId = req.kauth.grant.access_token.content.sub;
    logger.info(`[4/4] Received 'finalize-add' request for account: ${accountId}`);

    const account = await prisma.minecraftAccount.findFirst({
        where: { accountId, keycloakUserId }
    });
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    try {
        const MS_CLIENT_ID = process.env.MS_CLIENT_ID;
        if (!MS_CLIENT_ID) throw new Error("Microsoft Client ID (MS_CLIENT_ID) is not configured in .env file.");

        const authflow = new Authflow(account.loginEmail, msaFolderPath, {
            msalConfig: { auth: { clientId: MS_CLIENT_ID, authority: 'https://login.microsoftonline.com/common' } }
        });

        const { profile } = await authflow.getMinecraftJavaToken({ fetchProfile: true });
        const ingameName = profile?.name || 'Unknown';
        const newCache = await (authflow as any).cache.getCached();

        await prisma.minecraftAccount.update({
            where: { accountId },
            data: { status: 'ACTIVE', ingameName, authenticationCache: newCache }
        });

        const files = await fs.readdir(msaFolderPath);
        for (const file of files) {
            if (file.startsWith((authflow as any).cache.username)) {
                await fs.unlink(path.join(msaFolderPath, file));
            }
        }

        broadcast({ type: 'accounts_updated' });
        logger.info(`Account ${accountId} finalized as ${ingameName}.`);
        return res.status(200).json({ message: 'Account successfully verified.' });

    } catch(error: any) {
        logger.error(`Could not finalize account ${accountId}.`, { error: error.message });
        await prisma.minecraftAccount.delete({ where: { accountId } }).catch();
        return res.status(400).json({ error: 'Verification failed. The Microsoft login may not have been completed or the session expired. Please try again.' });
    }
});

app.get('/api/accounts', keycloak.protect(), async (req: any, res) => {
    const keycloakUserId = req.kauth.grant.access_token.content.sub;
    try {
        const accounts = await prisma.minecraftAccount.findMany({
            where: { keycloakUserId },
            select: {
                accountId: true,
                loginEmail: true,
                ingameName: true,
                status: true,
                session: { select: { status: true, lastKnownServerAddress: true } }
            },
            orderBy: { createdAt: 'asc' }
        });
        res.json(accounts);
    } catch (error) {
        logger.error('Failed to fetch accounts', { error });
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/bots/start', keycloak.protect(), async (req: any, res) => {
    const { accountIds, serverAddress, accountVersion } = req.body;
    const keycloakUserId = req.kauth.grant.access_token.content.sub;
    if (!accountIds || !Array.isArray(accountIds) || !serverAddress) {
         res.status(400).json({ error: 'accountIds and serverAddress are required.' });
         return;
    }
    const [host, portStr] = serverAddress.split(':');
    const port = portStr ? parseInt(portStr, 10) : 25565;

    for (const accountId of accountIds) {
        if (activeBots.has(accountId)) continue;
        const account = await prisma.minecraftAccount.findFirst({
            where: { accountId, keycloakUserId, status: 'ACTIVE' }
        });
        if (account && account.authenticationCache) {
            createBotInstance(accountId, account.loginEmail, account.authenticationCache, { host, port, version: accountVersion || false })
                .catch(err => logger.error(`Failed to start bot instance for ${accountId}`, { error: err }));
        } else {
            logger.warn(`Could not start bot for account ${accountId}: Not found, not active, or no auth cache.`);
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
    try {
        await prisma.minecraftAccount.delete({ where: { accountId, keycloakUserId } });
        logger.info(`Account ${accountId} deleted.`);
        broadcast({ type: 'accounts_updated' });
        res.status(204).send();
    } catch (error) {
        logger.error(`Failed to delete account ${accountId}`, { error });
        res.status(500).json({ error: 'Failed to delete account.' });
    }
});

// =========================================================================
// SERVER START UND GRACEFUL SHUTDOWN
// =========================================================================
async function main() {
    await fs.mkdir(msaFolderPath, { recursive: true });

    try {
        const files = await fs.readdir(msaFolderPath);
        for (const file of files) {
            if (file.endsWith('.json')) await fs.unlink(path.join(msaFolderPath, file));
        }
        logger.info('Cleaned up temporary cache directory.');
    } catch (error) {
        logger.error('Could not clean up cache directory.', { error });
    }

    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    signals.forEach((signal) => {
        process.on(signal, async () => {
            logger.info(`\n🚨 Received ${signal}, initiating graceful shutdown...`);
            wss.close();
            for (const bot of activeBots.values()) {
                bot.quit();
            }
            await new Promise(resolve => setTimeout(resolve, 1500));
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