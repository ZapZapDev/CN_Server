// src/controllers/authController.js
import authService from '../services/authService.js';
import apiService from '../services/apiService.js';

/**
 * Получение IP клиента
 */
async function getClientIp(req) {
    const headers = [
        req.get('CF-Connecting-IP'),
        req.get('X-Forwarded-For'),
        req.get('X-Real-IP')
    ];

    for (const header of headers) {
        if (header) {
            const ip = header.split(',')[0].trim();
            if (ip && !ip.startsWith('192.168.') && !ip.startsWith('10.')) {
                return ip;
            }
        }
    }

    return req.ip || req.connection?.remoteAddress || '127.0.0.1';
}

/**
 * Хелпер для ответа с ошибкой
 */
function errorResponse(res, code, message) {
    return res.status(code).json({ success: false, error: message });
}

/**
 * Авторизация
 */
export const login = async (req, res) => {
    try {
        const { walletAddress, extendedSession } = req.body;
        if (!walletAddress || walletAddress.length !== 44) {
            return errorResponse(res, 400, 'Invalid wallet address');
        }

        const clientIp = await getClientIp(req);
        const userAgent = req.get('User-Agent');

        const result = await authService.login(walletAddress, clientIp, userAgent, extendedSession);
        if (!result.success) {
            console.log(`❌ Failed login — Wallet: ${walletAddress}, IP: ${clientIp}`);
            return res.status(401).json(result);
        }

        console.log(`✅ Successful login — Wallet: ${walletAddress}, IP: ${clientIp}`);

        let apiKeyData = null;
        try {
            const user = await authService.getUserByWallet(walletAddress);
            if (user) {
                apiKeyData = await apiService.ensureUserApiKey(
                    user.id,
                    `Auto-generated API Key (${new Date().toISOString().split('T')[0]})`
                );
            }
        } catch (error) {
            console.error('API key generation failed:', error.message);
        }

        res.json({
            success: true,
            sessionKey: result.sessionKey,
            deviceHash: result.deviceHash,
            expiresAt: result.expiresAt,
            isNewUser: result.isNewUser,
            features: {
                multiDevice: true,
                autoExtension: true,
                hmacSecurity: true,
                apiAccess: !!apiKeyData
            },
            ...(apiKeyData ? { apiKey: apiKeyData } : { apiKeyError: 'API key not generated' })
        });

    } catch (error) {
        console.error('Login error:', error);
        return errorResponse(res, 500, 'Server error during login');
    }
};

/**
 * Валидация сессии
 */
export const validate = async (req, res) => {
    try {
        const { walletAddress, sessionKey } = req.body;
        if (!walletAddress || !sessionKey) {
            return errorResponse(res, 400, 'Missing data');
        }

        const clientIp = await getClientIp(req);
        const userAgent = req.get('User-Agent');

        const result = await authService.validateSession(walletAddress, sessionKey, clientIp, userAgent);
        if (!result.success) {
            return res.status(401).json(result);
        }

        let hasApiKey = false;
        try {
            const user = await authService.getUserByWallet(walletAddress);
            if (user) {
                const apiKeys = await apiService.getUserApiKeys(user.id);
                hasApiKey = apiKeys.some(key => key.isActive);
            }
        } catch (error) {
            console.error('API key check failed:', error.message);
        }

        res.json({
            ...result,
            security: {
                hmacVerified: true,
                deviceBound: true,
                apiEnabled: hasApiKey
            }
        });
    } catch (error) {
        console.error('Validation error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

/**
 * Логаут
 */
export const logout = async (req, res) => {
    try {
        const { walletAddress, deviceHash, allDevices } = req.body;
        if (!walletAddress) {
            return errorResponse(res, 400, 'Missing wallet address');
        }

        const clientIp = await getClientIp(req);

        const result = await authService.logout(walletAddress, allDevices ? null : deviceHash);

        console.log(`👋 User logged out — Wallet: ${walletAddress}, IP: ${clientIp}`);

        res.json({
            ...result,
            loggedOut: allDevices ? 'all_devices' : 'current_device'
        });
    } catch (error) {
        console.error('Logout error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

/**
 * Получение API-ключей
 */
export const getApiKeys = async (req, res) => {
    try {
        const { walletAddress } = req.body;
        if (!walletAddress) {
            return errorResponse(res, 400, 'Missing wallet address');
        }

        const user = await authService.getUserByWallet(walletAddress);
        if (!user) {
            return errorResponse(res, 404, 'User not found');
        }

        const apiKeys = await apiService.getUserApiKeys(user.id);

        res.json({
            success: true,
            data: apiKeys,
            count: apiKeys.length,
            activeCount: apiKeys.filter(key => key.isActive).length
        });
    } catch (error) {
        console.error('Get API keys error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

/**
 * Создание API-ключа
 */
export const createApiKey = async (req, res) => {
    try {
        const { walletAddress, name, rateLimit } = req.body;
        if (!walletAddress || !name) {
            return errorResponse(res, 400, 'Missing required fields');
        }

        const user = await authService.getUserByWallet(walletAddress);
        if (!user) {
            return errorResponse(res, 404, 'User not found');
        }

        const apiKey = await apiService.createApiKey(user.id, name, rateLimit || 1000);

        res.json({ success: true, data: apiKey, message: 'API key created successfully' });
    } catch (error) {
        console.error('Create API key error:', error);
        return errorResponse(res, 500, error.message || 'Server error');
    }
};

/**
 * Удаление API-ключа
 */
export const deleteApiKey = async (req, res) => {
    try {
        const { walletAddress, apiKeyId } = req.body;
        if (!walletAddress || !apiKeyId) {
            return errorResponse(res, 400, 'Missing required fields');
        }

        const user = await authService.getUserByWallet(walletAddress);
        if (!user) {
            return errorResponse(res, 404, 'User not found');
        }

        await apiService.deleteApiKey(user.id, apiKeyId);

        res.json({ success: true, message: 'API key deleted successfully' });
    } catch (error) {
        console.error('Delete API key error:', error);
        return errorResponse(res, 500, error.message || 'Server error');
    }
};

/**
 * Активные сессии
 */
export const getSessions = async (req, res) => {
    try {
        const { walletAddress } = req.body;
        if (!walletAddress) {
            return errorResponse(res, 400, 'Missing wallet address');
        }

        const sessions = await authService.getActiveSessions(walletAddress);

        res.json({ success: true, sessions, count: sessions.length });
    } catch (error) {
        console.error('Get sessions error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};

/**
 * Статистика безопасности
 */
export const getSecurityStats = async (req, res) => {
    try {
        const stats = await authService.getSecurityStats();
        const apiStats = await apiService.getApiStats();

        res.json({ success: true, stats: { ...stats, api: apiStats } });
    } catch (error) {
        console.error('Security stats error:', error);
        return errorResponse(res, 500, 'Server error');
    }
};
