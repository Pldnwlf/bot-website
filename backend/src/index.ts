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
import multer from 'multer';
import logger from './logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import { deserialize } from "node:v8";


const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

const logindelay = parseInt(process.env.LOGINDELAY || "20000");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const msaFolderPath = path.join(process.cwd(), 'msa');

const activeBots: Map<string, Bot> = new Map();

const pendingAuthenticationBots: Map<string, Bot> = new Map();


interface ActiveBot {
    instance: mineflayer.Bot;
    accountId: string;
    accountName?: string;
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcast(data: any) {
    const jsonData = JSON.stringify(data);
    logger.info(`BROADCAST: ${jsonData}`);
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) client.send(jsonData);
    });
}


const memoryStore = new session.MemoryStore();
const keycloak = new Keycloak({ store: memoryStore });
app.use(express.json());

app.use(cors({ origin: 'http://localhost:4200' }));

app.use(session({
    secret: 'some-secret-string-you-should-change', // Ändere diesen String!
    resave: false,
    saveUninitialized: true,
    store: memoryStore
}));

app.use(keycloak.middleware());


/**
 * Erstellt eine temporäre Cache-Datei für den Bot aus den DB-Daten.
 * @param accountId Die ID des Accounts.
 * @param cacheData Das JSON-Objekt aus der Datenbank.
 */

async function writeCacheFile(accountId: string, cacheData: Prisma.JsonValue): Promise<string> {
    const profilePath = path.join(msaFolderPath, `${accountId}.json`);
    await fs.writeFile(profilePath, JSON.stringify(cacheData, null, 2));
    return profilePath;
}

/**
 * Liest eine Cache-Datei und gibt den Inhalt als JSON zurück.
 * @param profilePath Der Pfad zur Cache-Datei.
 */
async function readCacheFile(profilePath: string): Promise<Prisma.JsonValue> {
    try {
        const fileContent = await fs.readFile(profilePath, 'utf-8');
        return JSON.parse(fileContent) as Prisma.JsonValue;
    } catch (error) {
        logger.error(`Could not read or parse cache file at ${profilePath}`, error);
        return {}; // Leeres Objekt bei Fehler
    }
}


async function createBotInstance(accountId: string, loginEmail: string, authCache: Prisma.JsonValue, options: { host: string; port: number, version?: string | false }) {
    const logMeta = { accountId, loginEmail };
    logger.info(`Starting bot instance for ${loginEmail}`, logMeta);

    // 1. Temporäre Cache-Datei für diesen Bot schreiben
    const profilePath = await writeCacheFile(accountId, authCache);

    const bot = mineflayer.createBot({
        username: loginEmail,
        auth: 'microsoft',
        version: options.version || "1.21",
        host: options.host,
        port: options.port,
        profilesFolder: msaFolderPath, // Sagt Mineflayer, wo es nach Caches suchen soll
        hideErrors: false
    });

    activeBots.set(accountId, bot);

    // Event-Handler für den Bot
    bot.once('login', async () => {
        logger.info(`Bot ${bot.username} logged in successfully.`, logMeta);

        // 2. Cache-Datei auslesen
        const updatedCache = await readCacheFile(profilePath);

        // Prüfen, ob der Cache ein gültiges, nicht-null Objekt ist.
        // Dies stellt sicher, dass wir kein `null` an die Datenbank übergeben.
        if (updatedCache && typeof updatedCache === 'object' && !Array.isArray(updatedCache)) {
            await prisma.minecraftAccount.update({
                where: { accountId },
                data: {
                    ingameName: bot.username,
                    // Jetzt ist TypeScript zufrieden, da `updatedCache` hier garantiert ein Objekt ist.
                    authenticationCache: updatedCache,
                    status: 'ACTIVE'
                }
            });
        } else {
            // Fallback, falls der Cache wider Erwarten ungültig ist.
            // Wir aktualisieren trotzdem den Namen und Status.
            logger.warn(`Invalid cache file for ${bot.username}, updating without cache.`, logMeta);
            await prisma.minecraftAccount.update({
                where: { accountId },
                data: {
                    ingameName: bot.username,
                    status: 'ACTIVE'
                }
            });
        }

        await prisma.botSession.update({
            where: { accountId },
            data: { status: 'connecting', isActive: true, lastSeenAt: new Date() }
        });
        broadcast({ type: 'status_update', payload: { accountId, status: `Logged in as ${bot.username}` } });
    });

    bot.once('spawn', async () => {
        logger.info(`Bot ${bot.username} spawned on ${options.host}.`, logMeta);
        await prisma.botSession.update({
            where: { accountId },
            data: {
                status: 'online_on_server',
                lastKnownServerAddress: options.host,
                lastKnownServerPort: options.port,
                lastKnownVersion: options.version || null
            }
        });
        broadcast({ type: 'status_update', payload: { accountId, status: `Online on ${options.host}` } });
    });

    bot.on('kicked', async (reason, loggedIn) => {
        (bot as any).wasKicked = true;
        const sessionLogMeta = { accountId, accountName: bot.username || loginEmail };

        function parseKickReason(component: any): string {
            if (typeof component === 'string') {
                try {
                    const parsed = JSON.parse(component);
                    return parseKickReason(parsed);
                } catch (e) {
                    return component;
                }
            }
            if (typeof component === 'object' && component !== null) {
                if (component.translate) {
                    let message = `[${component.translate}]`;
                    if (Array.isArray(component.with)) {
                        const args = component.with.map((item: any) => {
                            if (typeof item === 'object' && item !== null) return item.text || parseKickReason(item);
                            return item;
                        }).join(', ');
                        message += `: ${args}`;
                    }
                    return message;
                }
                let text = component.text || '';
                if (Array.isArray(component.extra)) {
                    text += component.extra.map(parseKickReason).join('');
                }
                if (text) return text;
            }
            try {
                return JSON.stringify(component);
            } catch {
                return 'Could not parse kick reason.';
            }
        }

        const detailedKickReason = parseKickReason(reason);
        logger.warn(`Bot was kicked. Reason: "${detailedKickReason}"`, { metadata: sessionLogMeta });

        await prisma.botSession.update({
            where: { accountId },
            data: {
                status: 'kicked',
                isActive: false,
                lastKickReason: detailedKickReason,
                lastKnownServerAddress: null,
                lastKnownServerPort: null,
            }
        });
        broadcast({ type: 'kicked', payload: { accountId, reason: detailedKickReason } });
    });

    // bot.on('message', (jsonMsg) => {
    //     const plainMessage = (jsonMsg).trim();
    //
    //     if (plainMessage.length === 0) {
    //         return;
    //     }
    //
    //     const chatRegex = /(?:\[([^\]]+)\]\s*)?(\w+):\s*(.*)/;
    //     const match = plainMessage.match(chatRegex);
    //
    //     let chatData;
    //
    //     if (match) {
    //         const [_, rank, username, message] = match;
    //         chatData = {
    //             type: 'structured_chat',
    //             username: username,
    //             rank: rank || null,
    //             message: message
    //         };
    //     } else {
    //         chatData = {
    //             type: 'system_message',
    //             message: plainMessage
    //         };
    //     }
    //
    //     broadcast({
    //         type: 'chat_message',
    //         payload: {
    //             accountId: accountId,
    //             ingameName: bot.username, // Der Name des Bots, der die Nachricht empfangen hat
    //             timestamp: new Date(),
    //             ...chatData // Füge die strukturierten Daten hinzu
    //         }
    //     });
    // });

    bot.on('error', async (err) => {
        logger.error(`Bot error for ${loginEmail}: ${err.message}`, { ...logMeta, error: err });
        broadcast({ type: 'bot_error', payload: { accountId, error: err.message } });
    });

    bot.once('end', async (reason) => {
        if ((bot as any).wasKicked) return;
        logger.info(`Bot ${bot.username} disconnected. Reason: ${reason || 'Unknown'}`, logMeta);
        activeBots.delete(accountId);
        await prisma.botSession.update({
            where: { accountId },
            data: { status: 'offline', isActive: false }
        });
        broadcast({ type: 'status_update', payload: { accountId, status: 'offline' } });
        await fs.unlink(profilePath); // 3. Temporäre Datei aufräumen
    });
}




async function logAllIds() {
    const allIds = await prisma.minecraftAccount.findMany();
    for (const account of allIds) {
        console.log(`Name: ${account.ingameName} | EMAIL: ${account.loginEmail} | ID: ${account.accountId}  `);
    }
}

async function getAllMinecraftAccounts(){
    console.log('🔎 Searching for all Minecraft accounts');
    const allMinecraftAccounts = await prisma.minecraftAccount.count()
    console.log(`✅ There are ${allMinecraftAccounts} Accounts registered`)
}


app.use(express.json());

// GESCHützer ENDPUNKTE

app.get('/api/minecraft-accounts', keycloak.protect(), async (req: any, res) => {
    try {
        // Die echte Keycloak User ID aus dem Token holen!
        const keycloakUserId = req.kauth.grant.access_token.content.sub;

        const accounts = await prisma.minecraftAccount.findMany({
            where: { keycloakUserId },
            select: {
                accountId: true,
                loginEmail: true,
                ingameName: true,
                session: {
                    select: {
                        status: true,
                        lastKnownServerAddress: true
                    }
                }
            }
        });
        res.json(accounts);
    } catch (error) {
        console.error("Failed to fetch accounts:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});



// ENDPUNKTE

app.post('/api/accounts/initiate-add', keycloak.protect(), async (req: any, res) => {
    const { loginEmail } = req.body;
    const keycloakUserId = req.kauth.grant.access_token.content.sub;

    if (!loginEmail) {
        res.status(400).json({ error: 'loginEmail is required.' })
        return;
    }

    // 1. Account in der DB erstellen mit Status PENDING_VERIFICATION
    let account;
    try {
        account = await prisma.minecraftAccount.create({
            data: {
                loginEmail,
                keycloakUserId,
                status: 'PENDING_VERIFICATION',
                session: { create: {} }
            }
        });
    } catch (e: any) {
        if (e.code === 'P2002'){
            res.status(409).json({ error: 'An account with this email already exists.' });
            return;
        }
        logger.error('Failed to create pending account in DB', e);
        res.status(500).json({ error: 'Database error.' });
        return;
    }

    const { accountId } = account;
    const logMeta = { accountId, loginEmail };

    // 2. Temporären "Authentifizierungs-Bot" erstellen
    const authBot = mineflayer.createBot({
        username: loginEmail,
        auth: 'microsoft',
        profilesFolder: msaFolderPath,
    });
    pendingAuthenticationBots.set(accountId, authBot);

    authBot.once('error', (err) => {
        if (err.message.includes('join the server')) {
            logger.info('Device login prompt received for pending account', logMeta);
            res.status(202).json({ accountId, prompt: err.message });
        } else {
            logger.error('Unexpected error during auth-bot creation', { ...logMeta, error: err });
            res.status(500).json({ error: 'Failed to get login link from Microsoft.' });
            pendingAuthenticationBots.delete(accountId);
            // Wenn der Auth-Bot fehlschlägt, den halbfertigen Account wieder löschen
            prisma.minecraftAccount.delete({ where: { accountId } }).catch();
        }
    });

    authBot.once('login', async () => {
        logger.info(`Pending account ${loginEmail} successfully authenticated as ${authBot.username}`, logMeta);

        // Temporäre Datei auslesen (wird von Mineflayer automatisch erstellt)
        const profilePath = path.join(msaFolderPath, `${loginEmail}.json`);
        const newCache = await readCacheFile(profilePath);

        // 3. Account in der DB finalisieren
        if (newCache && typeof newCache === 'object' && !Array.isArray(newCache)) {
            await prisma.minecraftAccount.update({
                where: { accountId },
                data: {
                    ingameName: authBot.username,
                    // Jetzt ist TypeScript zufrieden, da `updatedCache` hier garantiert ein Objekt ist.
                    authenticationCache: newCache,
                    status: 'ACTIVE'
                }
            });
        } else {
            logger.warn(`Invalid cache file for ${authBot.username}, updating without cache.`, logMeta);
            await prisma.minecraftAccount.update({
                where: { accountId },
                data: {
                    ingameName: authBot.username,
                    status: 'ACTIVE'
                }
            });
        }

        await fs.unlink(profilePath).catch(err => logger.warn(`Could not delete temp auth file: ${profilePath}`, err));
        pendingAuthenticationBots.delete(accountId);

        broadcast({ type: 'accounts_updated' });
        authBot.quit();
    });
});

// backend/src/index.ts

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
            createBotInstance(accountId, account.loginEmail, account.authenticationCache, {
                host,
                port,
                version: accountVersion || false
            }).catch(err => logger.error(`Failed to start bot instance for ${accountId}`, err));
        } else {
            logger.warn(`Could not start bot for account ${accountId}: Not found, not active, or no auth cache.`);
        }
        await new Promise(resolve => setTimeout(resolve, logindelay));
    }
    res.status(202).json({ message: 'Start command sent for selected accounts.' });
});

app.post('/api/bots/stop', keycloak.protect(), async (req: any, res) => {
    const { accountIds } = req.body;
    for (const accountId of accountIds) {
        if (activeBots.has(accountId)) {
            activeBots.get(accountId)?.quit();
        }
    }
    res.status(202).json({ message: 'Stop command sent for selected accounts.' });
});

app.get('/api/accounts', keycloak.protect(), async (req: any, res) => {
    const keycloakUserId = req.kauth.grant.access_token.content.sub;
    const accounts = await prisma.minecraftAccount.findMany({
        where: { keycloakUserId },
        select: {
            accountId: true,
            loginEmail: true,
            ingameName: true,
            status: true,
            session: {
                select: {
                    status: true,
                    lastKnownServerAddress: true
                }
            }
        }
    });
    res.json(accounts);
});


app.delete('/api/accounts/:accountId', keycloak.protect(), async (req: any, res) => {
    const { accountId } = req.params;
    const keycloakUserId = req.kauth.grant.access_token.content.sub;

    activeBots.get(accountId)?.quit(); // Stoppe den Bot, falls er läuft

    await prisma.minecraftAccount.delete({
        where: { accountId, keycloakUserId }
    });

    broadcast({ type: 'accounts_updated' });
    res.status(204).send();
});


wss.on('connection', (ws) => {
    console.log('🔌 New client connected to WebSocket.');

    ws.send(JSON.stringify({
        type: 'system',
        payload: { message: 'Welcome to the Bot Control WebSocket!' }
    }));

    const currentBotStates = Array.from(activeBots.keys());
    ws.send(JSON.stringify({
        type: 'system',
        payload: {
            message: 'Current active bot IDs.',
            activeBotIds: currentBotStates
        }
    }));


    // Logge, wenn ein Client die Verbindung schließt.
    ws.on('close', () => {
        console.log('🔌 Client disconnected from WebSocket.');
    });

    ws.on('message', (message) => {
        console.log('Received WebSocket message from client: %s', message);
        // Hier könnte man z.B. einen 'ping'-'pong'-Mechanismus implementieren,
        // um die Verbindung am Leben zu erhalten.
    });
});
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

signals.forEach((signal) => {
    process.on(signal, async () => {
        console.log(`\n🚨 Received ${signal}, initiating graceful shutdown...`);

        // 1. WebSocket-Server schließen, damit keine neuen Verbindungen angenommen werden.
        console.log('🔌 Closing WebSocket server...');
        wss.close();

        // 2. Alle aktiven Bot-Instanzen sauber beenden.
        // Die 'end'-Handler der Bots werden dadurch ausgelöst und setzen den DB-Status auf 'offline'.
        console.log(`🤖 Disconnecting ${activeBots.size} active bot(s)...`);
        for (const [accountId, activeBot] of activeBots.entries()) {
            console.log(` -> Disconnecting bot ${accountId}`);
            activeBots.get(accountId)?.quit();
        }

        // Eine kleine Verzögerung geben, damit die 'end'-Handler Zeit haben, ihre DB-Operationen abzuschließen.
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 3. Prisma-Client trennen.
        console.log('🗃️ Disconnecting from database...');
        await prisma.$disconnect();

        // 4. HTTP-Server schließen.
        console.log('🌐 Closing HTTP server...');
        server.close(() => {
            console.log('✅ Shutdown complete. Exiting.');
            process.exit(0);
        });
    });
});

// --- Server Start ---
server.listen(PORT, async () => {
    console.log(`🚀 Server listening on http://localhost:${PORT}`);
    await getAllMinecraftAccounts();
    await logAllIds(); // TODO Remove this
});