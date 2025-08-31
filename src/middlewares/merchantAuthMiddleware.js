// src/middlewares/merchantAuthMiddleware.js - ИСПРАВЛЕННАЯ ВЕРСИЯ
import User from '../models/User.js';
import authService from '../services/authService.js';

/**
 * Универсальный middleware для аутентификации пользователей
 * Проверяет сессию через authService и находит пользователя в БД
 */
export async function authenticateUser(req, res, next) {
    try {
        const { walletAddress, sessionKey } = req.body;

        if (!walletAddress || !sessionKey) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required - missing credentials'
            });
        }

        // Валидируем сессию через authService
        const validation = await authService.validateSession(
            walletAddress,
            sessionKey,
            req.ip,
            req.get('User-Agent')
        );

        if (!validation.success) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required - invalid session'
            });
        }

        // Находим пользователя в БД
        const user = await User.findOne({
            where: {
                sol_wallet: walletAddress,
                session_key: sessionKey,
                is_active: true
            }
        });

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required - user not found'
            });
        }

        // Добавляем пользователя в req для использования в контроллерах
        req.authenticatedUser = user;
        next();

    } catch (error) {
        console.error('❌ Authentication middleware error:', error);
        res.status(500).json({
            success: false,
            error: 'Authentication error'
        });
    }
}

/**
 * Middleware для проверки владения ресурсом
 * Проверяет что указанный ресурс принадлежит аутентифицированному пользователю
 */
export function authorizeResourceOwnership(Model, resourceIdParam = 'id') {
    return async (req, res, next) => {
        try {
            const resourceId = parseInt(req.params[resourceIdParam]);
            const userId = req.authenticatedUser.id;

            const resource = await Model.findOne({
                where: {
                    id: resourceId,
                    user_id: userId,
                    is_active: true
                }
            });

            if (!resource) {
                return res.status(404).json({
                    success: false,
                    error: `Resource not found or access denied`
                });
            }

            // Добавляем ресурс в req для использования в контроллере
            req.authorizedResource = resource;
            next();

        } catch (error) {
            console.error('❌ Authorization middleware error:', error);
            res.status(500).json({
                success: false,
                error: 'Authorization error'
            });
        }
    };
}