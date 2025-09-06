// src/services/apiService.js - ИСПРАВЛЕННАЯ ВЕРСИЯ
import API from '../models/API.js';
import User from '../models/User.js';
import { Op } from 'sequelize';
import crypto from 'crypto';

class APIService {
    /**
     * ИСПРАВЛЕНО: Ручная генерация ключа если автоматическая не сработала
     */
    generateManualApiKey() {
        const timestamp = Date.now().toString(36);
        const random = crypto.randomBytes(32).toString('hex');
        const key = `cn_${timestamp}_${random}`.substring(0, 64);
        console.log('🔧 Manual API key generation:', key.substring(0, 12) + '...');
        return key;
    }

    /**
     * Create or get API key for user during login - ИСПРАВЛЕННАЯ ВЕРСИЯ
     */
    async ensureUserApiKey(userId, keyName = 'Default API Key') {
        try {
            console.log('🔍 Checking for existing API key for user:', userId);

            // Check if user already has an active API key
            let apiKey = await API.findOne({
                where: {
                    user_id: userId,
                    is_active: true
                },
                order: [['created_at', 'DESC']]
            });

            if (apiKey) {
                console.log('✅ Found existing API key:', apiKey.api_key.substring(0, 12) + '...');
                return apiKey;
            }

            // ИСПРАВЛЕНО: Если нет активного ключа, создаем с принудительной генерацией
            console.log('🔑 Creating new API key for user:', userId);

            // Вариант 1: Пробуем обычное создание
            try {
                apiKey = await API.create({
                    user_id: userId,
                    name: keyName,
                    is_active: true,
                    rate_limit: 1000,
                    usage_count: 0
                    // api_key будет сгенерирован хуком
                });

                if (apiKey && apiKey.api_key) {
                    console.log('✅ API key created via hooks:', {
                        id: apiKey.id,
                        keyPreview: apiKey.api_key.substring(0, 12) + '...',
                        name: apiKey.name,
                        userId: userId
                    });
                    return apiKey;
                }
            } catch (hookError) {
                console.error('❌ Hook-based creation failed:', hookError.message);
            }

            // Вариант 2: Ручная генерация ключа
            console.log('🔧 Trying manual API key generation...');

            const manualKey = this.generateManualApiKey();

            apiKey = await API.create({
                api_key: manualKey, // Явно задаем ключ
                user_id: userId,
                name: keyName,
                is_active: true,
                rate_limit: 1000,
                usage_count: 0
            });

            if (apiKey && apiKey.api_key) {
                console.log('✅ API key created manually:', {
                    id: apiKey.id,
                    keyPreview: apiKey.api_key.substring(0, 12) + '...',
                    name: apiKey.name,
                    userId: userId
                });
                return apiKey;
            }

            throw new Error('Both automatic and manual API key generation failed');

        } catch (error) {
            console.error('❌ API key creation error:', error);

            // Финальная попытка: найти любой существующий ключ
            try {
                console.log('🔄 Final fallback: searching for any existing key...');

                const existingKey = await API.findOne({
                    where: { user_id: userId },
                    order: [['created_at', 'DESC']]
                });

                if (existingKey) {
                    if (!existingKey.is_active) {
                        await existingKey.update({ is_active: true });
                        console.log('✅ Reactivated existing API key');
                    }
                    return existingKey;
                }
            } catch (fallbackError) {
                console.error('❌ Fallback also failed:', fallbackError);
            }

            throw new Error(`Failed to create API key: ${error.message}`);
        }
    }

    /**
     * Get all API keys for a user
     */
    async getUserApiKeys(userId) {
        try {
            const apiKeys = await API.findAll({
                where: { user_id: userId },
                attributes: [
                    'id', 'api_key', 'name', 'is_active',
                    'last_used_at', 'usage_count', 'rate_limit',
                    'expires_at', 'created_at'
                ],
                order: [['created_at', 'DESC']]
            });

            return apiKeys.map(key => ({
                id: key.id,
                name: key.name,
                apiKey: key.api_key,
                isActive: key.is_active,
                lastUsedAt: key.last_used_at,
                usageCount: key.usage_count,
                rateLimit: key.rate_limit,
                expiresAt: key.expires_at,
                createdAt: key.created_at
            }));
        } catch (error) {
            console.error('❌ Get user API keys error:', error);
            throw new Error('Failed to fetch API keys');
        }
    }

    /**
     * Create new API key for user - ИСПРАВЛЕНО
     */
    async createApiKey(userId, name, rateLimit = 1000, expiresAt = null) {
        try {
            console.log('🔑 Creating API key manually:', { userId, name, rateLimit });

            // Генерируем ключ вручную
            const apiKeyString = this.generateManualApiKey();

            const apiKey = await API.create({
                api_key: apiKeyString, // Явно задаем ключ
                user_id: userId,
                name: name.trim(),
                rate_limit: rateLimit,
                expires_at: expiresAt,
                is_active: true
            });

            console.log('✅ New API key created manually:', apiKey.api_key.substring(0, 12) + '...', 'for user:', userId);

            return {
                id: apiKey.id,
                name: apiKey.name,
                apiKey: apiKey.api_key,
                rateLimit: apiKey.rate_limit,
                expiresAt: apiKey.expires_at,
                createdAt: apiKey.created_at
            };
        } catch (error) {
            console.error('❌ Create API key error:', error);
            throw new Error('Failed to create API key: ' + error.message);
        }
    }

    /**
     * Deactivate API key
     */
    async deactivateApiKey(userId, apiKeyId) {
        try {
            const apiKey = await API.findOne({
                where: {
                    id: apiKeyId,
                    user_id: userId
                }
            });

            if (!apiKey) {
                throw new Error('API key not found');
            }

            await apiKey.update({ is_active: false });

            console.log('🔒 API key deactivated:', apiKey.api_key.substring(0, 12) + '...');

            return true;
        } catch (error) {
            console.error('❌ Deactivate API key error:', error);
            throw new Error('Failed to deactivate API key');
        }
    }

    /**
     * Delete API key
     */
    async deleteApiKey(userId, apiKeyId) {
        try {
            const deleted = await API.destroy({
                where: {
                    id: apiKeyId,
                    user_id: userId
                }
            });

            if (deleted === 0) {
                throw new Error('API key not found');
            }

            console.log('🗑️ API key deleted:', apiKeyId);

            return true;
        } catch (error) {
            console.error('❌ Delete API key error:', error);
            throw new Error('Failed to delete API key');
        }
    }

    /**
     * Update API key settings
     */
    async updateApiKey(userId, apiKeyId, updates) {
        try {
            const apiKey = await API.findOne({
                where: {
                    id: apiKeyId,
                    user_id: userId
                }
            });

            if (!apiKey) {
                throw new Error('API key not found');
            }

            const allowedUpdates = ['name', 'rate_limit', 'expires_at'];
            const filteredUpdates = {};

            for (const [key, value] of Object.entries(updates)) {
                if (allowedUpdates.includes(key)) {
                    filteredUpdates[key] = value;
                }
            }

            await apiKey.update(filteredUpdates);

            console.log('✅ API key updated:', apiKey.api_key.substring(0, 12) + '...');

            return {
                id: apiKey.id,
                name: apiKey.name,
                rateLimit: apiKey.rate_limit,
                expiresAt: apiKey.expires_at,
                updatedAt: apiKey.updated_at
            };
        } catch (error) {
            console.error('❌ Update API key error:', error);
            throw new Error('Failed to update API key');
        }
    }

    /**
     * Clean up expired API keys
     */
    async cleanupExpiredKeys() {
        try {
            const now = new Date();

            const deleted = await API.destroy({
                where: {
                    expires_at: {
                        [Op.lt]: now
                    }
                }
            });

            if (deleted > 0) {
                console.log('🧹 Cleaned up', deleted, 'expired API keys');
            }

            return { deleted };
        } catch (error) {
            console.error('❌ Cleanup expired keys error:', error);
            return { deleted: 0 };
        }
    }

    /**
     * Get API usage statistics
     */
    async getApiStats(userId = null) {
        try {
            const whereClause = userId ? { user_id: userId } : {};

            // Get basic counts
            const totalKeys = await API.count({
                where: whereClause
            });

            const activeKeys = await API.count({
                where: {
                    ...whereClause,
                    is_active: true
                }
            });

            // Get usage stats
            const usageStats = await API.findAll({
                where: whereClause,
                attributes: [
                    [API.sequelize.fn('SUM', API.sequelize.col('usage_count')), 'totalRequests'],
                    [API.sequelize.fn('MAX', API.sequelize.col('last_used_at')), 'lastActivity']
                ],
                raw: true
            });

            return {
                totalKeys: totalKeys || 0,
                activeKeys: activeKeys || 0,
                totalRequests: parseInt(usageStats[0]?.totalRequests) || 0,
                lastActivity: usageStats[0]?.lastActivity
            };
        } catch (error) {
            console.error('❌ Get API stats error:', error);
            return {
                totalKeys: 0,
                activeKeys: 0,
                totalRequests: 0,
                lastActivity: null
            };
        }
    }

    /**
     * Validate API key and get user
     */
    async validateApiKey(apiKey) {
        try {
            const keyRecord = await API.findValidKey(apiKey);

            if (!keyRecord) {
                return { valid: false, error: 'Invalid or expired API key' };
            }

            return {
                valid: true,
                apiKey: keyRecord,
                user: keyRecord.user
            };
        } catch (error) {
            console.error('❌ Validate API key error:', error);
            return { valid: false, error: 'Validation failed' };
        }
    }

    /**
     * Record API key usage
     */
    async recordUsage(apiKeyId) {
        try {
            await API.increment(['usage_count'], {
                where: { id: apiKeyId }
            });

            await API.update(
                { last_used_at: new Date() },
                { where: { id: apiKeyId } }
            );

            return true;
        } catch (error) {
            console.error('❌ Record usage error:', error);
            return false;
        }
    }
}

export default new APIService();