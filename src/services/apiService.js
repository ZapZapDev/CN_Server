// src/services/apiService.js
import API from '../models/API.js';
import User from '../models/User.js';

class APIService {
    /**
     * Create or get API key for user during login
     */
    async ensureUserApiKey(userId, keyName = 'Default API Key') {
        try {
            // Check if user already has an active API key
            let apiKey = await API.findOne({
                where: {
                    user_id: userId,
                    is_active: true
                },
                order: [['created_at', 'DESC']]
            });

            // If no active API key exists, create one
            if (!apiKey) {
                apiKey = await API.create({
                    user_id: userId,
                    name: keyName,
                    is_active: true
                });

                console.log('✅ API key created for user:', userId, 'Key:', apiKey.api_key.substring(0, 12) + '...');
            }

            return apiKey;
        } catch (error) {
            console.error('❌ API key creation error:', error);
            throw new Error('Failed to create API key');
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
     * Create new API key for user
     */
    async createApiKey(userId, name, rateLimit = 1000, expiresAt = null) {
        try {
            const apiKey = await API.create({
                user_id: userId,
                name: name.trim(),
                rate_limit: rateLimit,
                expires_at: expiresAt,
                is_active: true
            });

            console.log('✅ New API key created:', apiKey.api_key.substring(0, 12) + '...', 'for user:', userId);

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
            throw new Error('Failed to create API key');
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

            const stats = await API.findAll({
                where: whereClause,
                attributes: [
                    [sequelize.fn('COUNT', sequelize.col('id')), 'totalKeys'],
                    [sequelize.fn('SUM', sequelize.col('usage_count')), 'totalRequests'],
                    [sequelize.fn('COUNT', sequelize.literal('CASE WHEN is_active = true THEN 1 END')), 'activeKeys'],
                    [sequelize.fn('MAX', sequelize.col('last_used_at')), 'lastActivity']
                ],
                raw: true
            });

            return {
                totalKeys: parseInt(stats[0].totalKeys) || 0,
                activeKeys: parseInt(stats[0].activeKeys) || 0,
                totalRequests: parseInt(stats[0].totalRequests) || 0,
                lastActivity: stats[0].lastActivity
            };
        } catch (error) {
            console.error('❌ Get API stats error:', error);
            throw new Error('Failed to fetch API statistics');
        }
    }
}

export default new APIService();