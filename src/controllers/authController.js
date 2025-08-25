import authService from '../services/authService.js';

// Получение реального IP клиента
async function getClientIp(req) {
    const headers = [
        req.get('CF-Connecting-IP'),
        req.get('Client-IP'),
        req.get('X-Forwarded-For'),
        req.get('X-Forwarded'),
        req.get('X-Cluster-Client-IP'),
        req.get('Forwarded-For'),
        req.get('Forwarded')
    ];

    for (const header of headers) {
        if (header) {
            const ips = header.split(',').map(ip => ip.trim());
            for (const ip of ips) {
                if (isValidPublicIp(ip)) {
                    console.log('🌐 Real IP found in headers:', ip);
                    return ip;
                }
            }
        }
    }

    let fallbackIp = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;

    if (!fallbackIp || ['127.0.0.1', '::1', 'localhost'].includes(fallbackIp) || fallbackIp.startsWith('192.168.') || fallbackIp.startsWith('10.')) {
        const externalIp = await getExternalIp();
        if (externalIp) {
            console.log('🌐 External IP from service:', externalIp);
            return externalIp;
        }
    }

    console.log('🌐 Using fallback IP:', fallbackIp);
    return fallbackIp || '127.0.0.1';
}

function isValidPublicIp(ip) {
    if (!ip) return false;

    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipv4Regex.test(ip)) return false;

    const parts = ip.split('.').map(Number);
    if (
        parts[0] === 10 ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168) ||
        parts[0] === 127 ||
        parts[0] === 0 ||
        parts[0] >= 224
    ) {
        return false;
    }

    return true;
}

async function getExternalIp() {
    try {
        const response = await fetch('https://api.ipify.org?format=text', { timeout: 5000 });
        const ip = await response.text();
        const cleanIp = ip.trim();

        if (isValidPublicIp(cleanIp)) {
            return cleanIp;
        }
    } catch (error) {
        console.error('❌ External IP service error:', error.message);
    }
    return null;
}

// ВАЖНО: export const перед каждой функцией!
export const login = async (req, res) => {
    try {
        const { walletAddress } = req.body;

        if (!walletAddress || walletAddress.length !== 44) {
            return res.status(400).json({
                success: false,
                error: 'Invalid wallet address'
            });
        }

        const clientIp = await getClientIp(req);
        const result = await authService.login(walletAddress, clientIp);

        res.json(result);
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
        const result = await authService.validateSession(walletAddress, sessionKey, clientIp);

        res.json(result);
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
        const { walletAddress } = req.body;

        if (!walletAddress) {
            return res.status(400).json({
                success: false,
                error: 'Missing wallet address'
            });
        }

        const result = await authService.logout(walletAddress);
        res.json(result);
    } catch (error) {
        console.error('❌ Logout error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
};