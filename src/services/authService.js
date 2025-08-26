import crypto from 'crypto';
import User from '../models/User.js';

class AuthService {
    // Генерация сессионного ключа
    generateSessionKey() {
        return crypto.randomBytes(32).toString('hex');
    }

    // Логин пользователя
    async login(walletAddress, clientIp) {
        console.log('🔐 Login attempt:', walletAddress.slice(0, 8) + '...', 'from IP:', clientIp);

        // ИСПРАВЛЕНИЕ: Сначала ищем пользователя с таким же IP
        const existingUserWithSameIp = await User.findOne({
            where: { last_ip: clientIp }
        });

        // Если есть пользователь с таким IP, но другим кошельком
        if (existingUserWithSameIp && existingUserWithSameIp.sol_wallet !== walletAddress) {
            console.log('🔄 Same IP, different wallet. Updating user record...');

            const newSessionKey = this.generateSessionKey();

            // Обновляем существующую запись с новым кошельком и сессией
            await existingUserWithSameIp.update({
                sol_wallet: walletAddress,
                session_key: newSessionKey,
                last_ip: clientIp
            });

            console.log('✅ User record updated with new wallet');
            return {
                success: true,
                sessionKey: newSessionKey,
                isNewSession: true
            };
        }

        // Ищем пользователя по кошельку
        let user = await User.findOne({
            where: { sol_wallet: walletAddress }
        });

        const newSessionKey = this.generateSessionKey();

        if (!user) {
            // Создаем нового пользователя
            user = await User.create({
                sol_wallet: walletAddress,
                session_key: newSessionKey,
                last_ip: clientIp
            });
            console.log('✅ New user created');

            return {
                success: true,
                sessionKey: newSessionKey,
                isNewSession: true
            };
        } else {
            // Проверяем IP
            if (user.last_ip !== clientIp) {
                console.log('🔄 Different IP detected, generating new session');
                // Новый IP - генерируем новый ключ
                await user.update({
                    session_key: newSessionKey,
                    last_ip: clientIp
                });

                return {
                    success: true,
                    sessionKey: newSessionKey,
                    isNewSession: true
                };
            } else {
                console.log('✅ Same IP and wallet, existing session');
                // ИСПРАВЛЕНИЕ: Всегда генерируем новый ключ для надежности
                await user.update({
                    session_key: newSessionKey
                });

                return {
                    success: true,
                    sessionKey: newSessionKey,
                    isNewSession: false
                };
            }
        }
    }

    // Валидация сессии
    async validateSession(walletAddress, sessionKey, clientIp) {
        console.log('🔍 Validating session for:', walletAddress.slice(0, 8) + '...');

        const user = await User.findOne({
            where: {
                sol_wallet: walletAddress,
                session_key: sessionKey
            }
        });

        if (!user) {
            console.log('❌ Session invalid');
            return { success: false };
        }

        // Проверяем IP
        if (user.last_ip !== clientIp) {
            console.log('❌ IP changed, session invalid');
            return { success: false };
        }

        console.log('✅ Session valid');
        return { success: true };
    }

    // Логаут (очистка сессии)
    async logout(walletAddress) {
        await User.update(
            { session_key: null },
            { where: { sol_wallet: walletAddress } }
        );
        console.log('🚪 User logged out');
        return { success: true };
    }
}

export default new AuthService();