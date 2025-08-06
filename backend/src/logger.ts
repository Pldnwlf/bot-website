import winston, { format, Logform } from 'winston';

// Definiere die Farben für die verschiedenen Log-Level
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue',
};

winston.addColors(colors);
export interface LogMeta {
    accountId?: string;
    accountName?: string;
    error?: any;
}

interface CustomLogformInfo extends Logform.TransformableInfo {
    metadata?: LogMeta;
}

const logFormat = format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.colorize({ all: true }),
    format.printf((info: CustomLogformInfo) => {
        const metadata = info.metadata || {};
        const { accountId, accountName } = metadata;

        let identity = '';
        if (accountId) {
            identity = accountName ? `[${accountName} - ${accountId}]` : `[${accountId}]`;
        }

        let message = `${info.timestamp} ${info.level} ${identity}: ${info.message}`;

        // Bonus: Wenn ein Fehlerobjekt in den Metadaten übergeben wird, logge den Stacktrace.
        if (metadata.error && metadata.error instanceof Error) {
            message += `\n${metadata.error.stack}`;
        }

        return message;
    })
);

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
        new winston.transports.Console(),
    ],
    exceptionHandlers: [
        new winston.transports.Console(),
    ],
    rejectionHandlers: [
        new winston.transports.Console(),
    ],
});

export default logger;