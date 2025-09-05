// src/controllers/authController.js - UPDATED WITH API KEY CREATION
import authService from '../services/authService.js';
import apiService from '../services/apiService.js'; // NEW IMPORT

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
            // NEW: Create or ensure API key exists for the user
            try {
                const user = await authService.getUserByWallet(walletAddress);
                if (user) {
                    const apiKey = await apiService.ensureUserApiKey(user.id, 'Auto-generated API Key');

                    // Include API key in response
                    result.apiKey = {
                        key: apiKey.api_key,
                        name: apiKey.name,
                        rateLimit: apiKey.rate_limit,
                        createdAt: apiKey.created_at
                    };
                }
            } catch (apiError) {
                console.error('❌ API key creation failed during login:', apiError);
                // Don't fail login if API key creation fails
            }

            res.json({
                ...result,
                features: {
                    multiDevice: true,
                    autoExtension: true,
                    hmacSecurity: true,
                    apiAccess: true // NEW FEATURE FLAG
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
                    deviceBound: true,
                    apiEnabled: true // NEW SECURITY FLAG
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

        // If allDevices=true, then deviceHash is ignored and logout from all devices
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

// NEW: API Key Management Endpoints
export const getApiKeys = async (req, res) => {
    try {
        const { walletAddress } = req.body;

        if (!walletAddress) {
            return res.status(400).json({
                success: false,
                error: 'Missing wallet address'
            });
        }

        const user = await authService.getUserByWallet(walletAddress);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const apiKeys = await apiService.getUserApiKeys(user.id);

        res.json({
            success: true,
            data: apiKeys,
            count: apiKeys.length
        });

    } catch (error) {
        console.error('❌ Get API keys error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
};

export const createApiKey = async (req, res) => {
    try {
        const { walletAddress, name, rateLimit } = req.body;

        if (!walletAddress || !name) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        const user = await authService.getUserByWallet(walletAddress);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const apiKey = await apiService.createApiKey(user.id, name, rateLimit);

        res.json({
            success: true,
            data: apiKey,
            message: 'API key created successfully'
        });

    } catch (error) {
        console.error('❌ Create API key error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
};

export const deleteApiKey = async (req, res) => {
    try {
        const { walletAddress, apiKeyId } = req.body;

        if (!walletAddress || !apiKeyId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        const user = await authService.getUserByWallet(walletAddress);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        await apiService.deleteApiKey(user.id, apiKeyId);

        res.json({
            success: true,
            message: 'API key deleted successfully'
        });

    } catch (error) {
        console.error('❌ Delete API key error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Server error'
        });
    }
};

// Existing endpoints remain unchanged
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

// Admin endpoint: security statistics
export const getSecurityStats = async (req, res) => {
    try {
        const stats = await authService.getSecurityStats();
        const apiStats = await apiService.getApiStats();

        res.json({
            success: true,
            stats: {
                ...stats,
                api: apiStats
            }
        });
    } catch (error) {
        console.error('❌ Security stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error'
        });
    }
};