// src/controllers/authController.js - COMPLETE ENHANCED VERSION
import authService from '../services/authService.js';
import apiService from '../services/apiService.js';

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

        console.log('🔐 Login attempt:', {
            wallet: walletAddress.slice(0, 8) + '...',
            ip: clientIp,
            userAgent: userAgent?.slice(0, 50) + '...'
        });

        const result = await authService.login(walletAddress, clientIp, userAgent, extendedSession);

        if (result.success) {
            console.log('✅ Login successful, generating API key...');

            // ENHANCED: Guaranteed API key generation with multiple fallback attempts
            let apiKeyData = null;
            let apiKeyError = null;

            try {
                const user = await authService.getUserByWallet(walletAddress);

                if (!user) {
                    throw new Error('User not found after successful login');
                }

                console.log('👤 Found user ID:', user.id);

                // Try to ensure API key exists with retries
                let attempts = 0;
                const maxAttempts = 3;

                while (attempts < maxAttempts && !apiKeyData) {
                    attempts++;
                    console.log(`🔑 API key generation attempt ${attempts}/${maxAttempts}`);

                    try {
                        const apiKey = await apiService.ensureUserApiKey(
                            user.id,
                            `Auto-generated API Key (${new Date().toISOString().split('T')[0]})`
                        );

                        if (apiKey && apiKey.api_key) {
                            apiKeyData = {
                                key: apiKey.api_key,
                                name: apiKey.name,
                                rateLimit: apiKey.rate_limit,
                                isActive: apiKey.is_active,
                                createdAt: apiKey.created_at,
                                usageCount: apiKey.usage_count || 0
                            };

                            console.log('✅ API key generated successfully:', {
                                keyPreview: apiKey.api_key.substring(0, 12) + '...',
                                name: apiKey.name,
                                rateLimit: apiKey.rate_limit
                            });
                            break;
                        }
                    } catch (attemptError) {
                        console.error(`❌ API key attempt ${attempts} failed:`, attemptError.message);
                        apiKeyError = attemptError;

                        if (attempts < maxAttempts) {
                            console.log('⏰ Waiting 1 second before retry...');
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                }

                if (!apiKeyData) {
                    throw new Error(`Failed to generate API key after ${maxAttempts} attempts: ${apiKeyError?.message}`);
                }

            } catch (error) {
                console.error('❌ API key generation failed:', error);
                apiKeyError = error;

                // FALLBACK: Try direct API key creation
                try {
                    console.log('🔄 Attempting fallback API key creation...');
                    const user = await authService.getUserByWallet(walletAddress);

                    if (user) {
                        const fallbackApiKey = await apiService.createApiKey(
                            user.id,
                            'Fallback Auto-generated Key',
                            1000,
                            null
                        );

                        apiKeyData = {
                            key: fallbackApiKey.apiKey,
                            name: fallbackApiKey.name,
                            rateLimit: fallbackApiKey.rateLimit,
                            isActive: true,
                            createdAt: fallbackApiKey.createdAt,
                            usageCount: 0
                        };

                        console.log('✅ Fallback API key created successfully');
                    }
                } catch (fallbackError) {
                    console.error('❌ Fallback API key creation also failed:', fallbackError);
                    // Don't fail login even if API key creation fails completely
                }
            }

            // Prepare response
            const response = {
                success: true,
                sessionKey: result.sessionKey,
                deviceHash: result.deviceHash,
                expiresAt: result.expiresAt,
                isNewUser: result.isNewUser,
                features: {
                    multiDevice: true,
                    autoExtension: true,
                    hmacSecurity: true,
                    apiAccess: !!apiKeyData // true if API key was generated
                }
            };

            // Include API key if successfully generated
            if (apiKeyData) {
                response.apiKey = apiKeyData;
                console.log('🎉 Login response includes API key');
            } else {
                response.apiKeyError = 'API key generation failed, but login succeeded';
                console.log('⚠️ Login succeeded but without API key');
            }

            res.json(response);

        } else {
            console.log('❌ Login failed:', result.error);
            res.status(401).json(result);
        }

    } catch (error) {
        console.error('❌ Login controller error:', error);
        res.status(500).json({
            success: false,
            error: 'Server error during login'
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
            // Check if user has API key during validation
            let hasApiKey = false;
            try {
                const user = await authService.getUserByWallet(walletAddress);
                if (user) {
                    const apiKeys = await apiService.getUserApiKeys(user.id);
                    hasApiKey = apiKeys.some(key => key.isActive);
                }
            } catch (error) {
                console.error('❌ API key check during validation failed:', error);
            }

            res.json({
                ...result,
                security: {
                    hmacVerified: true,
                    deviceBound: true,
                    apiEnabled: hasApiKey
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

// API Key Management Endpoints
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
            count: apiKeys.length,
            activeCount: apiKeys.filter(key => key.isActive).length
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

        const apiKey = await apiService.createApiKey(user.id, name, rateLimit || 1000);

        res.json({
            success: true,
            data: apiKey,
            message: 'API key created successfully'
        });

    } catch (error) {
        console.error('❌ Create API key error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Server error'
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