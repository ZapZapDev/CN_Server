/**
 * Форматировать число с определенным количеством знаков после запятой
 */
export function formatNumber(number, decimals = 2) {
    return parseFloat(number).toFixed(decimals);
}

/**
 * Генерировать случайную строку
 */
export function generateRandomString(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Валидировать email
 */
export function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Логировать с временной меткой
 */
export function logWithTimestamp(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const emoji = {
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
        success: '✅'
    };

    console.log(`${emoji[level] || 'ℹ️'} ${timestamp} - ${message}`);
}

/**
 * Задержка выполнения
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Безопасное парсирование JSON
 */
export function safeJsonParse(str, defaultValue = null) {
    try {
        return JSON.parse(str);
    } catch {
        return defaultValue;
    }
}

/**
 * Обрезать строку с многоточием
 */
export function truncateString(str, maxLength = 50) {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
}

/**
 * Конвертировать lamports в SOL
 */
export function lamportsToSol(lamports) {
    return lamports / 1_000_000_000;
}

/**
 * Конвертировать SOL в lamports
 */
export function solToLamports(sol) {
    return Math.floor(sol * 1_000_000_000);
}

/**
 * Форматировать адрес кошелька
 */
export function formatWalletAddress(address, startChars = 4, endChars = 4) {
    if (!address || address.length < startChars + endChars) {
        return address;
    }
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Проверить является ли строка валидным Solana адресом
 */
export function isValidSolanaAddress(address) {
    try {
        // Solana адреса всегда 44 символа в base58
        return typeof address === 'string' &&
            address.length === 44 &&
            /^[1-9A-HJ-NP-Za-km-z]+$/.test(address);
    } catch {
        return false;
    }
}

/**
 * Retry функция с экспоненциальной задержкой
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;

            const delayMs = baseDelay * Math.pow(2, i);
            logWithTimestamp(`Retry ${i + 1}/${maxRetries} failed, waiting ${delayMs}ms...`, 'warn');
            await delay(delayMs);
        }
    }
}