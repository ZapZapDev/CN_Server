// src/services/authService.js - UPDATED WITH USER HELPER METHOD
import crypto from 'crypto';
import User from '../models/User.js';
import { Op } from 'sequelize';

class AuthService {
    constructor() {
        this.SERVER_SECRET = process.env.SERVER_SECRET || 'cryptonow_super_secret_key_2025';
    }

    generateSessionKey() {
        return crypto.randomBytes(32).toString('hex');
    }

    createSecureHash(sessionKey, walletAddress) {
        return crypto
            .createHmac('sha256', this.SERVER_SECRET)
            .update(sessionKey + walletAddress)
            .digest('hex');
    }

    createDeviceHash(userAgent, walletAddress) {
        if (!userAgent) return crypto.randomBytes(16).toString('hex');

        const deviceInfo = userAgent.slice(0, 200) + walletAddress.slice(0, 8);
        return crypto.createHash('sha256').update(deviceInfo).digest('hex');
    }

    getExpirationTime(extendedSession = false) {
        const now = new Date();
        const days = extendedSession ? 7 : 2;
        return new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));
    }

    // NEW: Helper method to get user by wallet address
    async getUserByWallet(walletAddress) {
        try {
            const user = await User.findOne({
                where: { sol_wallet: walletAddress }
            });
            return user;
        } catch (error) {
            console.error('❌ Get user by wallet error:', error);
            return null;
        }
    }

    async login(walletAddress, clientIp, userAgent = null, extendedSession = false) {
        console.log('🔐 Login:', walletAddress.slice(0, 8) + '...', 'IP:', clientIp);

        const deviceHash = this.createDeviceHash(userAgent, walletAddress);
        const sessionKey = this.generateSessionKey();
        const sessionHash = this.createSecureHash(sessionKey, walletAddress);
        const expiresAt = this.getExpirationTime(extendedSession);

        try {
            // ALWAYS TRY TO FIND AND UPDATE FIRST
            const [user, created] = await User.findOrCreate({
                where: {
                    sol_wallet: walletAddress,
                    device_hash: deviceHash
                },
                defaults: {
                    sol_wallet: walletAddress,
                    session_key: sessionKey,
                    session_hash: sessionHash,
                    device_hash: deviceHash,
                    last_ip: clientIp,
                    is_active: true,
                    last_activity: new Date(),
                    expires_at: expiresAt,
                    suspicious_activity: 0
                }
            });

            if (!created) {
                // Record already existed - update it
                console.log('✅ Found existing user, updating session');

                await user.update({
                    session_key: sessionKey,
                    session_hash: sessionHash,
                    last_ip: clientIp,
                    is_active: true,
                    last_activity: new Date(),
                    expires_at: expiresAt
                });
            } else {
                console.log('✅ Created new user session');
            }

            return {
                success: true,
                sessionKey: sessionKey,
                deviceHash: deviceHash,
                expiresAt: expiresAt,
                isNewUser: created
            };

        } catch (error) {
            console.error('❌ Login error:', error.message);

            // FALLBACK: if findOrCreate didn't work, try to find and update existing user
            try {
                console.log('🔄 Fallback: trying to find and update existing user');

                const existingUser = await User.findOne({
                    where: { sol_wallet: walletAddress }
                });

                if (existingUser) {
                    await existingUser.update({
                        session_key: sessionKey,
                        session_hash: sessionHash,
                        device_hash: deviceHash,
                        last_ip: clientIp,
                        is_active: true,
                        last_activity: new Date(),
                        expires_at: expiresAt
                    });

                    console.log('✅ Fallback successful - updated existing user');

                    return {
                        success: true,
                        sessionKey: sessionKey,
                        deviceHash: deviceHash,
                        expiresAt: expiresAt,
                        isNewUser: false
                    };
                }
            } catch (fallbackError) {
                console.error('❌ Fallback also failed:', fallbackError.message);
            }

            return {
                success: false,
                error: 'Login failed - please try again'
            };
        }
    }

    async validateSession(walletAddress, sessionKey, clientIp, userAgent = null) {
        console.log('🔍 Validating session:', walletAddress.slice(0, 8) + '...');

        try {
            const deviceHash = this.createDeviceHash(userAgent, walletAddress);

            const user = await User.findOne({
                where: {
                    sol_wallet: walletAddress,
                    session_key: sessionKey,
                    is_active: true,
                    expires_at: { [Op.gt]: new Date() }
                }
            });

            if (!user) {
                console.log('❌ Session not found or expired');
                return { success: false };
            }

            // Check HMAC
            const expectedHash = this.createSecureHash(sessionKey, walletAddress);
            if (user.session_hash !== expectedHash) {
                console.log('❌ HMAC verification failed');
                await user.update({ is_active: false, session_key: null });
                return { success: false };
            }

            // Update activity and IP
            const updateData = { last_activity: new Date() };

            if (user.last_ip !== clientIp) {
                console.log('📍 IP changed:', user.last_ip, '->', clientIp);
                updateData.last_ip = clientIp;
            }

            // Auto-extension if less than a day remains
            const now = new Date();
            const timeLeft = user.expires_at.getTime() - now.getTime();
            const dayInMs = 24 * 60 * 60 * 1000;

            if (timeLeft < dayInMs) {
                updateData.expires_at = new Date(now.getTime() + (2 * dayInMs));
                console.log('⏰ Session auto-extended');
            }

            await user.update(updateData);

            console.log('✅ Session validated');
            return { success: true };

        } catch (error) {
            console.error('❌ Validation error:', error);
            return { success: false };
        }
    }

    async logout(walletAddress) {
        try {
            await User.update(
                { is_active: false, session_key: null },
                { where: { sol_wallet: walletAddress } }
            );

            console.log('🚪 User logged out');
            return { success: true };
        } catch (error) {
            console.error('❌ Logout error:', error);
            return { success: false };
        }
    }

    async getActiveSessions(walletAddress) {
        try {
            const sessions = await User.findAll({
                where: {
                    sol_wallet: walletAddress,
                    is_active: true,
                    expires_at: { [Op.gt]: new Date() }
                },
                attributes: ['device_hash', 'last_ip', 'last_activity', 'expires_at', 'created_at'],
                order: [['last_activity', 'DESC']]
            });

            return sessions.map(session => ({
                deviceHash: session.device_hash,
                lastIp: session.last_ip,
                lastActivity: session.last_activity,
                expiresAt: session.expires_at,
                createdAt: session.created_at
            }));
        } catch (error) {
            console.error('❌ Get active sessions error:', error);
            return [];
        }
    }

    async cleanupSessions() {
        try {
            const now = new Date();

            const deactivated = await User.update(
                { is_active: false, session_key: null },
                {
                    where: {
                        is_active: true,
                        expires_at: { [Op.lt]: now }
                    }
                }
            );

            console.log('🧹 Cleanup: deactivated', deactivated[0], 'expired sessions');
            return { deactivated: deactivated[0] };

        } catch (error) {
            console.error('❌ Cleanup error:', error);
            return { deactivated: 0 };
        }
    }

    async getSecurityStats() {
        try {
            const totalUsers = await User.count({
                distinct: true,
                col: 'sol_wallet'
            });

            const activeSessions = await User.count({
                where: {
                    is_active: true,
                    expires_at: { [Op.gt]: new Date() }
                }
            });

            const todayLogins = await User.count({
                where: {
                    last_activity: {
                        [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
                    }
                }
            });

            return {
                totalUsers,
                activeSessions,
                todayLogins
            };
        } catch (error) {
            console.error('❌ Security stats error:', error);
            return {
                totalUsers: 0,
                activeSessions: 0,
                todayLogins: 0
            };
        }
    }
}

export default new AuthService();