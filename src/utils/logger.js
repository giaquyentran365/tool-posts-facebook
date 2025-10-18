const { query } = require('../config/database');

/**
 * Log action to database
 */
const logAction = async ({
    userId,
    postId = null,
    groupId = null,
    action,
    status,
    message = null,
    errorDetails = null,
    executionTime = null
}) => {
    try {
        await query(
            `INSERT INTO logs (user_id, post_id, group_id, action, status, message, error_details, execution_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [userId, postId, groupId, action, status, message, errorDetails ? JSON.stringify(errorDetails) : null, executionTime]
        );
    } catch (error) {
        logger.error('Failed to log action:', error);
    }
};

/**
 * Console logger with colors
 */
const fs = require('fs');
const path = require('path');
const logFilePath = path.join(__dirname, '../../logs/app.log');

function writeLog(level, message) {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    fs.appendFileSync(logFilePath, message + '\n', { encoding: 'utf8' });
}

const logger = {
    info: (message, data = null) => {
        const output = data ? `${message} ${JSON.stringify(data)}` : message;
        const logMsg = `[INFO] ${output}`;
        console.log(logMsg);
        writeLog('INFO', logMsg);
    },
    success: (message, data = null) => {
        const output = data ? `${message} ${JSON.stringify(data)}` : message;
        const logMsg = `[SUCCESS] ${output}`;
        console.log(logMsg);
        writeLog('SUCCESS', logMsg);
    },
    error: (message, error = null) => {
        const output = error ? `${message} ${error.message || error}` : message;
        const logMsg = `[ERROR] ${output}`;
        console.error(logMsg);
        writeLog('ERROR', logMsg);
    },
    warn: (message, data = null) => {
        const output = data ? `${message} ${JSON.stringify(data)}` : message;
        const logMsg = `[WARN] ${output}`;
        console.warn(logMsg);
        writeLog('WARN', logMsg);
    },
    debug: (message, data = null) => {
        if (process.env.NODE_ENV === 'development') {
            const output = data ? `${message} ${JSON.stringify(data)}` : message;
            const logMsg = `[DEBUG] ${output}`;
            console.log(logMsg);
            writeLog('DEBUG', logMsg);
        }
    }
};

module.exports = {
    logAction,
    logger
};