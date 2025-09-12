// src/services/apiService.js - ОПТИМИЗИРОВАННАЯ ВЕРСИЯ
import API from '../models/API.js';
import { Op } from 'sequelize';
import crypto from 'crypto';

class APIService {
    // ==============================
    // 🔹 Хелперы
    // ==============================
    generateManualApiKey() {
        const timestamp = Date.now().toString(36);
        const random = crypto.randomBytes(32).toString('hex');
        return `cn_${timestamp}_${random}`.substring(0, 64);
    }

    keyPreview(key) {
        return key ? key.substring(0, 12) + '...' : null;
    }

    logError(prefix, error) {
        console.error(`❌ ${prefix}:`, error.message || error);
    }

    // ==============================
    // 🔹 Основная логика
    // ==============================

    async ensureUserApiKey(userId, keyName = 'Default API Key') {
        try {
            let apiKey = await API.findOne({
                where: { user_id: userId, is_active: true },
                order: [['created_at', 'DESC']]
            });

            if (apiKey) return apiKey;

            // Пробуем обычное создание (хуки)
            try {
                apiKey = await API.create({
                    user_id: userId,
                    name: keyName,
                    is_active: true,
                    rate_limit: 1000,
                    usage_count: 0
                });

                if (apiKey?.api_key) {
                    console.log('✅ API key created via hooks:', this.keyPreview(apiKey.api_key));
                    return apiKey;
                }
            } catch (hookError) {
                this.logError('Hook-based creation failed', hookError);
            }

            // Если хуки не сработали → ручная генерация
            const manualKey = this.generateManualApiKey();
            apiKey = await API.create({
                api_key: manualKey,
                user_id: userId,
                name: keyName,
                is_active: true,
                rate_limit: 1000,
                usage_count: 0
            });

            console.log('✅ API key created manually:', this.keyPreview(apiKey.api_key));
            return apiKey;

        } catch (error) {
            this.logError('API key creation error', error);

            // fallback: берем последний ключ
            try {
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
                this.logError('Fallback failed', fallbackError);
            }

            throw new Error(`Failed to create API key: ${error.message}`);
        }
    }

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

            return apiKeys.map(k => ({
                id: k.id,
                name: k.name,
                apiKey: k.api_key,
                isActive: k.is_active,
                lastUsedAt: k.last_used_at,
                usageCount: k.usage_count,
                rateLimit: k.rate_limit,
                expiresAt: k.expires_at,
                createdAt: k.created_at
            }));
        } catch (error) {
            this.logError('Get user API keys', error);
            throw new Error('Failed to fetch API keys');
        }
    }

    async createApiKey(userId, name, rateLimit = 1000, expiresAt = null) {
        try {
            const apiKeyString = this.generateManualApiKey();
            const apiKey = await API.create({
                api_key: apiKeyString,
                user_id: userId,
                name: name.trim(),
                rate_limit: rateLimit,
                expires_at: expiresAt,
                is_active: true
            });

            console.log('✅ API key created manually:', this.keyPreview(apiKey.api_key));

            return {
                id: apiKey.id,
                name: apiKey.name,
                apiKey: apiKey.api_key,
                rateLimit: apiKey.rate_limit,
                expiresAt: apiKey.expires_at,
                createdAt: apiKey.created_at
            };
        } catch (error) {
            this.logError('Create API key', error);
            throw new Error('Failed to create API key');
        }
    }

    async deactivateApiKey(userId, apiKeyId) {
        try {
            const apiKey = await API.findOne({ where: { id: apiKeyId, user_id: userId } });
            if (!apiKey) throw new Error('API key not found');

            await apiKey.update({ is_active: false });
            console.log('🔒 API key deactivated:', this.keyPreview(apiKey.api_key));
            return true;
        } catch (error) {
            this.logError('Deactivate API key', error);
            throw new Error('Failed to deactivate API key');
        }
    }

    async deleteApiKey(userId, apiKeyId) {
        try {
            const deleted = await API.destroy({ where: { id: apiKeyId, user_id: userId } });
            if (!deleted) throw new Error('API key not found');

            console.log('🗑️ API key deleted:', apiKeyId);
            return true;
        } catch (error) {
            this.logError('Delete API key', error);
            throw new Error('Failed to delete API key');
        }
    }

    async updateApiKey(userId, apiKeyId, updates) {
        try {
            const apiKey = await API.findOne({ where: { id: apiKeyId, user_id: userId } });
            if (!apiKey) throw new Error('API key not found');

            const allowed = ['name', 'rate_limit', 'expires_at'];
            const filtered = Object.fromEntries(
                Object.entries(updates).filter(([k]) => allowed.includes(k))
            );

            await apiKey.update(filtered);
            console.log('✅ API key updated:', this.keyPreview(apiKey.api_key));

            return {
                id: apiKey.id,
                name: apiKey.name,
                rateLimit: apiKey.rate_limit,
                expiresAt: apiKey.expires_at,
                updatedAt: apiKey.updated_at
            };
        } catch (error) {
            this.logError('Update API key', error);
            throw new Error('Failed to update API key');
        }
    }

    async cleanupExpiredKeys() {
        try {
            const deleted = await API.destroy({
                where: { expires_at: { [Op.lt]: new Date() } }
            });

            if (deleted) console.log('🧹 Cleaned up', deleted, 'expired API keys');
            return { deleted };
        } catch (error) {
            this.logError('Cleanup expired keys', error);
            return { deleted: 0 };
        }
    }

    async getApiStats(userId = null) {
        try {
            const where = userId ? { user_id: userId } : {};
            const totalKeys = await API.count({ where });
            const activeKeys = await API.count({ where: { ...where, is_active: true } });

            const usage = await API.findAll({
                where,
                attributes: [
                    [API.sequelize.fn('SUM', API.sequelize.col('usage_count')), 'totalRequests'],
                    [API.sequelize.fn('MAX', API.sequelize.col('last_used_at')), 'lastActivity']
                ],
                raw: true
            });

            return {
                totalKeys: totalKeys || 0,
                activeKeys: activeKeys || 0,
                totalRequests: parseInt(usage[0]?.totalRequests) || 0,
                lastActivity: usage[0]?.lastActivity
            };
        } catch (error) {
            this.logError('Get API stats', error);
            return { totalKeys: 0, activeKeys: 0, totalRequests: 0, lastActivity: null };
        }
    }

    async validateApiKey(apiKey) {
        try {
            const keyRecord = await API.findValidKey(apiKey);
            if (!keyRecord) return { valid: false, error: 'Invalid or expired API key' };

            return { valid: true, apiKey: keyRecord, user: keyRecord.user };
        } catch (error) {
            this.logError('Validate API key', error);
            return { valid: false, error: 'Validation failed' };
        }
    }

    async recordUsage(apiKeyId) {
        try {
            await API.increment(['usage_count'], { where: { id: apiKeyId } });
            await API.update({ last_used_at: new Date() }, { where: { id: apiKeyId } });
            return true;
        } catch (error) {
            this.logError('Record usage', error);
            return false;
        }
    }
}

export default new APIService();
