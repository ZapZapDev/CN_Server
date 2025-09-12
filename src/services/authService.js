// src/services/authService.js
import crypto from 'crypto';
import User from '../models/User.js';
import { Op } from 'sequelize';

class AuthService {
    constructor() {
        this.SERVER_SECRET = process.env.SERVER_SECRET || 'cryptonow_super_secret_key_2025';
    }

    // --- Utility methods ---
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

    async getUserByWallet(walletAddress) {
        try {
            return await User.findOne({ where: { sol_wallet: walletAddress } });
        } catch (error) {
            console.error('❌ Get user by wallet error:', error);
            return null;
        }
    }

    // --- Auth methods ---
    async login(walletAddress, clientIp, userAgent = null, extendedSession = false) {
        const deviceHash = this.createDeviceHash(userAgent, walletAddress);
        const sessionKey = this.generateSessionKey();
        const sessionHash = this.createSecureHash(sessionKey, walletAddress);
        const expiresAt = this.getExpirationTime(extendedSession);

        try {
            const [user, created] = await User.findOrCreate({
                where: { sol_wallet: walletAddress, device_hash: deviceHash },
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
                await user.update({
                    session_key: sessionKey,
                    session_hash: sessionHash,
                    last_ip: clientIp,
                    is_active: true,
                    last_activity: new Date(),
                    expires_at: expiresAt
                });
            }

            return {
                success: true,
                sessionKey,
                deviceHash,
                expiresAt,
                isNewUser: created
            };

        } catch (error) {
            console.error('❌ Login error:', error.message);

            // fallback: try updating existing
            try {
                const existingUser = await User.findOne({ where: { sol_wallet: walletAddress } });
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
                    return {
                        success: true,
                        sessionKey,
                        deviceHash,
                        expiresAt,
                        isNewUser: false
                    };
                }
            } catch (fallbackError) {
                console.error('❌ Fallback login failed:', fallbackError.message);
            }

            return { success: false, error: 'Login failed' };
        }
    }

    async validateSession(walletAddress, sessionKey, clientIp, userAgent = null) {
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

            if (!user) return { success: false };

            const expectedHash = this.createSecureHash(sessionKey, walletAddress);
            if (user.session_hash !== expectedHash) {
                await user.update({ is_active: false, session_key: null });
                return { success: false };
            }

            const now = new Date();
            const updateData = { last_activity: now };

            if (user.last_ip !== clientIp) updateData.last_ip = clientIp;

            const timeLeft = user.expires_at.getTime() - now.getTime();
            if (timeLeft < 24 * 60 * 60 * 1000) {
                updateData.expires_at = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
            }

            await user.update(updateData);
            return { success: true };

        } catch (error) {
            console.error('❌ Validate session error:', error);
            return { success: false };
        }
    }

    async logout(walletAddress) {
        try {
            await User.update(
                { is_active: false, session_key: null },
                { where: { sol_wallet: walletAddress } }
            );
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

            return sessions.map(s => ({
                deviceHash: s.device_hash,
                lastIp: s.last_ip,
                lastActivity: s.last_activity,
                expiresAt: s.expires_at,
                createdAt: s.created_at
            }));
        } catch (error) {
            console.error('❌ Get active sessions error:', error);
            return [];
        }
    }

    async cleanupSessions() {
        try {
            const now = new Date();
            const [deactivated] = await User.update(
                { is_active: false, session_key: null },
                { where: { is_active: true, expires_at: { [Op.lt]: now } } }
            );
            return { deactivated };
        } catch (error) {
            console.error('❌ Cleanup sessions error:', error);
            return { deactivated: 0 };
        }
    }

    async getSecurityStats() {
        try {
            const totalUsers = await User.count({ distinct: true, col: 'sol_wallet' });
            const activeSessions = await User.count({
                where: { is_active: true, expires_at: { [Op.gt]: new Date() } }
            });
            const todayLogins = await User.count({
                where: { last_activity: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
            });

            return { totalUsers, activeSessions, todayLogins };
        } catch (error) {
            console.error('❌ Security stats error:', error);
            return { totalUsers: 0, activeSessions: 0, todayLogins: 0 };
        }
    }
}

export default new AuthService();
