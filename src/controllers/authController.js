import authService from '../services/authService.js';

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

export const login = async (req, res) => {
    try {
        const { walletAddress, extendedSession } = req.body;

        if (!walletAddress || walletAddress.length !== 44) {
            return res.status(400).json({
                success: false,
                error: 'Invalid wallet address'
            });
        }

        const clientIp = await getClientIp(req);
        const userAgent = req.get('User-Agent');

        const result = await authService.login(walletAddress, clientIp, userAgent, extendedSession);

        if (result.success) {
            res.json({
                ...result,
                features: {
                    multiDevice: true,
                    autoExtension: true,
                    hmacSecurity: true
                }
            });
        } else {
            res.status(401).json(result);
        }

    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
};

export const validate = async (req, res) => {
    try {
        const { walletAddress, sessionKey } = req.body;

        if (!walletAddress || !sessionKey) {
            return res.status(400).json({
                success: false,
                error: 'Missing data'
            });
        }

        const clientIp = await getClientIp(req);
        const userAgent = req.get('User-Agent');

        const result = await authService.validateSession(walletAddress, sessionKey, clientIp, userAgent);

        if (result.success) {
            res.json({
                ...result,
                security: {
                    hmacVerified: true,
                    deviceBound: true
                }
            });
        } else {
            res.status(401).json(result);
        }

    } catch (error) {
        console.error('❌ Validation error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
};

export const logout = async (req, res) => {
    try {
        const { walletAddress, deviceHash, allDevices } = req.body;

        if (!walletAddress) {
            return res.status(400).json({
                success: false,
                error: 'Missing wallet address'
            });
        }

        // Если allDevices=true, то deviceHash игнорируется и логаут со всех устройств
        const result = await authService.logout(walletAddress, allDevices ? null : deviceHash);

        res.json({
            ...result,
            loggedOut: allDevices ? 'all_devices' : 'current_device'
        });

    } catch (error) {
        console.error('❌ Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
};

// Новый эндпоинт: получить все активные сессии
export const getSessions = async (req, res) => {
    try {
        const { walletAddress } = req.body;

        if (!walletAddress) {
            return res.status(400).json({
                success: false,
                error: 'Missing wallet address'
            });
        }

        const sessions = await authService.getActiveSessions(walletAddress);

        res.json({
            success: true,
            sessions,
            count: sessions.length
        });

    } catch (error) {
        console.error('❌ Get sessions error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
};

// Админ эндпоинт: статистика безопасности
export const getSecurityStats = async (req, res) => {
    try {
        const stats = await authService.getSecurityStats();
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('❌ Security stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
};