import * as winston from 'winston';

// Definiere die Farben für die verschiedenen Log-Level
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue',
};

winston.addColors(colors);

// Erstelle das benutzerdefinierte Format für die Log-Nachrichten
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ all: true }),
    winston.format.printf((info) => {
        const { accountId, accountName } = info.metadata || {};

        let identity = '';
        if (accountId) {
            identity = accountName ? `[${accountName} - ${accountId}]` : `[${info.accountId}]`;
        }

        // Gib die formatierte Nachricht zurück
        return `${info.timestamp} ${info.level} ${identity}: ${info.message}`;
    })
);

// Erstelle und exportiere die Logger-Instanz
const logger = winston.createLogger({
    level: 'debug', // Zeige alle Logs ab dem Level 'debug' an
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        debug: 4,
    },
    format: logFormat,
    transports: [
        // Alle Logs sollen in der Konsole ausgegeben werden
        new winston.transports.Console(),
    ],
    // Wenn ein Fehler nicht abgefangen wird, logge ihn, anstatt den Prozess abstürzen zu lassen
    exceptionHandlers: [
        new winston.transports.Console(),
    ],
    // Auch bei nicht abgefangenen Promise-Rejections loggen
    rejectionHandlers: [
        new winston.transports.Console(),
    ],
});

export default logger;