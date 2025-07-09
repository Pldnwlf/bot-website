import dotenv from 'dotenv';
dotenv.config();
import Keycloak from 'keycloak-connect';
import cors from 'cors';
import session from 'express-session'; // Keycloak benötigt eine Session
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from './utils/crypto';
import * as mineflayer from 'mineflayer';
import { WebSocketServer } from 'ws';
import http from 'http';
import * as util from "node:util";
import { Bot } from "mineflayer";

//  Globale Konstanten und Variablen
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

const logindelay = parseInt(process.env.LOGINDELAY || "1000");

interface ActiveBot {
    instance: mineflayer.Bot;
    accountId: string;
}
const activeBots: Map<string, ActiveBot> = new Map();

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function parseChatComponent(component: any): string {
    if (!component) {
        return '';
    }
    if (typeof component === 'string') {
        return component;
    }
    let message = '';
    if (component.text) {
        message += component.text;
    }

    if (component.extra && Array.isArray(component.extra)) {
        message += component.extra.map((part: any) => parseChatComponent(part)).join('');
    }

    return message;
}


// 3. Globale Helferfunktionen
function broadcast(data: any) {
    const jsonData = JSON.stringify(data);

    console.log(`BroadcastTest: ${jsonData}`);
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(jsonData);
        }
    });
}



// KEYCLOAK =========================

const memoryStore = new session.MemoryStore();
const keycloak = new Keycloak({ store: memoryStore });
// --- Express Middleware & API Endpunkte ---
app.use(express.json());

// CORS Middleware: Erlaube Anfragen vom Angular-Frontend
app.use(cors({ origin: 'http://localhost:4200' }));

// Session Middleware, die von Keycloak benötigt wird
app.use(session({
    secret: 'some-secret-string-you-should-change', // Ändere diesen String!
    resave: false,
    saveUninitialized: true,
    store: memoryStore
}));

// Keycloak Middleware
app.use(keycloak.middleware());



function createBotInstance(
    accountId: string,
    loginEmail: string,
    password_decrypted: string,
    options: { host: string; port: number, version?: string | false }
): mineflayer.Bot {
    console.log(`[${accountId}] Creating bot for ${options.host}:${options.port}...`);

    const bot = mineflayer.createBot({
        username: loginEmail,
        password: password_decrypted,
        auth: 'microsoft',
        host: options.host,
        port: options.port,
        version: options.version ? options.version : undefined,
        hideErrors: true
    });
    bot.once('login', async () => {
        console.log(`[${accountId}] Logged in as ${bot.username}. Waiting for spawn...`);
        await prisma.minecraftAccount.update({
            where: {accountId},
            data: {ingameName: bot.username}
        });
        await prisma.botSession.update({
            where: {accountId},
            data: {status: 'connecting', isActive: true, lastSeenAt: new Date()}
        });
    });

    bot.once('spawn', async () => {
        console.log(`[${accountId}] Spawned successfully on ${options.host}.`);


        console.log(`[${accountId}] Performing post-spawn action to appear 'alive'.`);
        bot.chat("mhm");
        await prisma.botSession.update({
            where: {accountId},
            data: {
                status: 'online_on_server',
                isActive: true,
                lastKnownServerAddress: options.host,
                lastKnownServerPort: options.port,
                lastKnownVersion: options.version || null,
                lastSeenAt: new Date()
            }
        });
        broadcast({type: 'status', payload: {accountId, status: `Online on ${options.host}`}});
    });

    bot.on('kicked', async (reason, loggedIn) => {
        (bot as any).wasKicked = true;

        const getMessageFromComponent = (component: any): string => {
            if (!component) return '';
            if (typeof component === 'string') return component;

            let message = component.text || '';
            if (component.extra && Array.isArray(component.extra)) {
                message += component.extra.map(getMessageFromComponent).join('');
            }
            if (component.translate) {
                message += ` (Translate: ${component.translate})`; // Sicherere Ausgabe
            }

            return message;
        };

        const kickMessage = getMessageFromComponent(reason) || 'Connection lost or kicked by server.';

        console.log(`[${accountId}] Bot was kicked. Parsed Reason: "${kickMessage}"`);

        // Datenbank-Update
        await prisma.botSession.update({
            where: {accountId},
            data: {
                status: 'kicked',
                isActive: false,
                lastKickReason: kickMessage,
                lastKnownServerAddress: null,
                lastKnownServerPort: null,
            }
        });

        broadcast({
            type: 'kicked',
            payload: {
                accountId: accountId,
                reason: kickMessage
            }
        });
    });

    bot.on('message', (jsonMsg) => {
        const plainMessage = parseChatComponent(jsonMsg).trim();

        if (plainMessage.length === 0) {
            return;
        }

        const chatRegex = /(?:\[([^\]]+)\]\s*)?(\w+):\s*(.*)/;
        const match = plainMessage.match(chatRegex);

        let chatData;

        if (match) {
            const [_, rank, username, message] = match;
            chatData = {
                type: 'structured_chat',
                username: username,
                rank: rank || null,
                message: message
            };
        } else {
            chatData = {
                type: 'system_message',
                message: plainMessage
            };
        }

        broadcast({
            type: 'chat_message', // Ein klarer Typ für das Frontend
            payload: {
                accountId: accountId,
                ingameName: bot.username, // Der Name des Bots, der die Nachricht empfangen hat
                timestamp: new Date(),
                ...chatData // Füge die strukturierten Daten hinzu
            }
        });
    });


    bot.on('error', (err) => {
        console.error(`[${accountId}] Bot Error:`, err);
        broadcast({type: 'status', payload: {accountId, status: `Error: ${err.message}`}});
        // Der 'end'-Handler wird normalerweise nach einem Fehler ausgelöst, der das Aufräumen übernimmt.
    });

    bot.once('end', (reason) => {
        if ((bot as any).wasKicked) {
            console.log(`[${accountId}] 'end' event ignored because bot was kicked.`);
            return;
        }
        console.log(`[${accountId}] Bot disconnected. Reason: ${reason}`);

        activeBots.delete(accountId);

        prisma.botSession.update({
            where: {accountId},
            data: {
                status: 'offline',
                isActive: false,
                lastKnownServerAddress: null,
                lastKnownServerPort: null,
                lastKnownVersion: null,
                lastSeenAt: new Date()
            }
        }).catch(console.error);

        broadcast({
            type: 'status',
            payload: {
                accountId: accountId,
                status: 'offline',
                reason: reason
            }
        });
    });

    return bot;
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


/// Replace your existing reconnectActiveBotsOnStartup function.
async function reconnectActiveBotsOnStartup() {
    console.log('🔄 Checking for bots to reconnect...');
    const accountsToReconnect = await prisma.minecraftAccount.findMany({
        where: { session: { isActive: true, lastKnownServerAddress: { not: null } } },
        include: { session: true }
    });

    if (accountsToReconnect.length === 0) {
        console.log('✅ No active bots to reconnect.');
        return;
    }

    console.log(`Found ${accountsToReconnect.length} bot(s) to reconnect.`);
    for (const account of accountsToReconnect) {
        try {
            console.log(`Attempting to reconnect bot ${account.accountId} to ${account.session!.lastKnownServerAddress}...`);
            const password = decrypt(Buffer.from(account.iv), Buffer.from(account.encryptedPassword));

            const botInstance = createBotInstance(account.accountId, account.loginEmail, password, {
                host: account.session!.lastKnownServerAddress!,
                port: account.session!.lastKnownServerPort!,
                version: account.session!.lastKnownVersion || false
            });

            // Add the successfully re-created bot to the active map.
            activeBots.set(account.accountId, { instance: botInstance, accountId: account.accountId });

        } catch (error) {
            console.error(`❌ Failed to reconnect bot ${account.accountId}:`, error);
            await prisma.botSession.update({
                where: { accountId: account.accountId },
                data: { status: 'error', isActive: false }
            });
        }
    }
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

app.post('/api/minecraft-accounts', keycloak.protect(), async (req: any, res) => {
    try {
        const { loginEmail, password } = req.body;
        console.log(`Adding Account for: ${loginEmail}`);
        const keycloakUserId = req.kauth.grant.access_token.content.sub;

        if (!loginEmail || !password) {
             res.status(400).json({ error: 'Username and password are required' });
            return;
        }

        // Passwort verschlüsseln
        const { iv, encryptedData } = encrypt(password);

        // Account und zugehörige BotSession in einer Transaktion erstellen
        const newAccount = await prisma.minecraftAccount.create({
            data: {
                loginEmail: loginEmail,
                keycloakUserId: keycloakUserId,
                encryptedPassword: encryptedData,
                iv: iv,
                // Die verknüpfte BotSession wird direkt mit erstellt
                session: {
                    create: {
                        status: 'offline',
                        isActive: false,
                    },
                },
            },
            // Wähle aus, welche Felder zurückgegeben werden sollen
            select: {
                accountId: true,
                loginEmail: true,
                createdAt: true
            }
        });
        console.log(`Account Created for: ${loginEmail}`);
        res.status(201).json(newAccount);
    } catch (error: any) {
        // Fehlerbehandlung für den Fall, dass der Username bereits existiert
        if (error.code === 'P2002' && error.meta?.target?.includes('minecraftUsername')) {
             res.status(409).json({ error: 'A user with this Minecraft username already exists.' });
            return;
        }
        console.error('Failed to create Minecraft account:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// backend/src/index.ts

app.post('/api/bots/startmultiple', keycloak.protect(), async (req: any, res: any) => {
    const { accountIds, serverAddress, accountVersion } = req.body;
    const keycloakUserId = req.kauth.grant.access_token.content.sub;

    if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
        return res.status(400).json({ error: 'accountIds must be a non-empty array.' });
    }
    if (!serverAddress) {
        return res.status(400).json({ error: 'serverAddress is required.' });
    }

    const results = {
        success: [] as string[],
        failed: [] as { accountId: string, reason: string }[]
    };

    for (const accountId of accountIds) {
        try {
            const account = await prisma.minecraftAccount.findFirstOrThrow({
                where: { accountId, keycloakUserId }
            });

            // 1. Check for and quit an existing bot BEFORE creating a new one.
            if (activeBots.has(accountId)) {
                console.log(`[${accountId}] Quitting existing bot instance before starting a new one.`);
                const existingBot = activeBots.get(accountId);
                existingBot?.instance.quit(); // We can safely quit here.
                activeBots.delete(accountId);
            }

            // 2. Create the new bot instance. This might throw an error.
            const password = decrypt(Buffer.from(account.iv), Buffer.from(account.encryptedPassword));
            const newBotInstance = createBotInstance(accountId, account.loginEmail, password, {
                host: serverAddress,
                port: 25565,
                version: accountVersion || false
            });

            activeBots.set(accountId, { instance: newBotInstance, accountId });
            results.success.push(accountId);

        } catch (error: any) {
            // This will catch any error from createBotInstance, including "Invalid credentials".
            const reason = error.message || 'Unknown error during startup';
            console.error(`[${accountId}] Failed to start bot in multi-start:`, reason);
            results.failed.push({ accountId, reason: reason });
            // Broadcast the failure so the frontend knows immediately.
            broadcast({
                type: 'status',
                payload: { accountId, status: `Failed: ${reason}` }
            });
        }

        // Apply delay after each attempt.
        await new Promise(resolve => setTimeout(resolve, logindelay));
    }

    res.status(207).json({
        message: 'Multi-start process completed.',
        ...results
    });
});

app.post('/api/bots/stopmultiple', keycloak.protect(), async (req: any, res) => {
    const { accountIds } = req.body;
    const keycloakUserId = req.kauth.grant.access_token.content.sub;

    if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
         res.status(400).json({ error: 'accountIds must be a non-empty array.' });
        return;
    }

    const results = {
        success: [] as string[],
        failed: [] as { accountId: string, reason: string }[]
    };

    for (const accountId of accountIds) {
        try {
            // Stelle sicher, dass der Bot dem User gehört
            const account = await prisma.minecraftAccount.findFirst({
                where: { accountId, keycloakUserId }
            });

            if (!account) {
                results.failed.push({ accountId, reason: 'Account not found or permission denied.' });
                continue;
            }

            // Finde den aktiven Bot in unserer Map
            const activeBot = activeBots.get(accountId);
            if (activeBot) {
                activeBot.instance.quit(); // Löst den 'end' Handler aus, der alles aufräumt
                results.success.push(accountId);
            } else {
                // Wenn der Bot nicht aktiv war, ist das kein Fehler, sondern nur eine Info
                results.failed.push({ accountId, reason: 'Bot was not running.' });
            }
        } catch (error: any) {
            results.failed.push({ accountId, reason: error.message || 'Unknown error during stop.' });
        }
    }

    res.status(207).json({
        message: 'Multi-stop process completed.',
        ...results
    });
});


app.delete('/api/minecraft-accounts/:accountId', keycloak.protect(), async (req: any, res: any) => {
    const { accountId } = req.params;
    const keycloakUserId = req.kauth.grant.access_token.content.sub;

    try {
        const account = await prisma.minecraftAccount.findFirstOrThrow({
            where: { accountId, keycloakUserId }
        });

        const activeBot = activeBots.get(accountId);
        if (activeBot) {
            console.log(`[${accountId}] Stopping bot before deletion...`);
            activeBot.instance.quit();
            await new Promise(resolve => setTimeout(resolve, 250));
        }

        await prisma.$transaction(async (tx) => {
            await tx.botSession.deleteMany({
                where: { accountId: account.accountId }
            });
            await tx.minecraftAccount.delete({
                where: { accountId: account.accountId }
            });
        });

        console.log(`[${accountId}] Account and session deleted successfully.`);
        // A 204 No Content response is standard for a successful DELETE operation with no body to return.
        res.status(204).send();

    } catch (error: any) {
        // Prisma's findFirstOrThrow will throw an error if the record is not found.
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Account not found or you do not have permission.' });
        }
        console.error(`[${accountId}] Failed to delete account:`, error);
        res.status(500).json({ error: 'Internal server error.' });
    }
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
            activeBot.instance.quit();
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
    await reconnectActiveBotsOnStartup();
});