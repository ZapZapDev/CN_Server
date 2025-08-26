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

    async login(walletAddress, clientIp, userAgent = null, extendedSession = false) {
        console.log('🔐 Login:', walletAddress.slice(0, 8) + '...', 'IP:', clientIp);

        const deviceHash = this.createDeviceHash(userAgent, walletAddress);
        const sessionKey = this.generateSessionKey();
        const sessionHash = this.createSecureHash(sessionKey, walletAddress);
        const expiresAt = this.getExpirationTime(extendedSession);

        try {
            // ВСЕГДА СНАЧАЛА ПРОБУЕМ НАЙТИ И ОБНОВИТЬ
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
                // Запись уже была - обновляем её
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

            // FALLBACK: если findOrCreate не сработал, попробуем просто найти и обновить
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

            // Проверяем HMAC
            const expectedHash = this.createSecureHash(sessionKey, walletAddress);
            if (user.session_hash !== expectedHash) {
                console.log('❌ HMAC verification failed');
                await user.update({ is_active: false, session_key: null });
                return { success: false };
            }

            // Обновляем активность и IP
            const updateData = { last_activity: new Date() };

            if (user.last_ip !== clientIp) {
                console.log('📍 IP changed:', user.last_ip, '->', clientIp);
                updateData.last_ip = clientIp;
            }

            // Авто-продление если осталось меньше дня
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
}

export default new AuthService();