// src/models/API.js - ИСПРАВЛЕННАЯ ВЕРСИЯ (убраны избыточные индексы)
import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';
import crypto from 'crypto';

// Helper: безопасная генерация API-ключа
function generateSecureApiKey() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(32).toString('hex');
    const key = `cn_${timestamp}_${random}`.substring(0, 64);
    return key;
}

const API = sequelize.define('API', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    api_key: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        validate: { len: [32, 64] }
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: User, key: 'id' }
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: 'Default API Key',
        validate: { len: [1, 255] }
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    last_used_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    usage_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    rate_limit: {
        type: DataTypes.INTEGER,
        defaultValue: 1000, // requests per hour
        validate: { min: 1, max: 10000 }
    },
    expires_at: {
        type: DataTypes.DATE,
        allowNull: true // null = never expires
    }
}, {
    tableName: 'api_keys',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    // ИСПРАВЛЕНО: Убираем избыточные индексы, оставляем только критически важные
    indexes: [
        // Основной индекс для поиска по API ключу
        {
            name: 'api_key_unique',
            unique: true,
            fields: ['api_key']
        },
        // Индекс для поиска ключей пользователя
        {
            name: 'user_id_index',
            fields: ['user_id']
        },
        // Композитный индекс для активных ключей пользователя
        {
            name: 'user_active_index',
            fields: ['user_id', 'is_active']
        }
    ],
    hooks: {
        // Генерация API-ключа перед валидацией
        beforeValidate: (apiKey) => {
            if (!apiKey.api_key) {
                apiKey.api_key = generateSecureApiKey();
                console.log('🔑 API key generated:', apiKey.api_key.substring(0, 12) + '...');
            }
        }
    }
});

// ================= Instance methods =================
API.prototype.isValid = function() {
    return this.is_active && (!this.expires_at || new Date() <= this.expires_at);
};

API.prototype.recordUsage = async function() {
    try {
        this.usage_count += 1;
        this.last_used_at = new Date();
        await this.save();
    } catch (err) {
        console.error('❌ Failed to record API usage:', err.message);
    }
};

// ================= Static methods =================
API.generateSecureApiKey = generateSecureApiKey;

API.findValidKey = async function(apiKey) {
    const key = await this.findOne({
        where: { api_key: apiKey },
        include: [{ model: User, as: 'user', required: true }]
    });

    return key?.isValid() ? key : null;
};

// ================= Associations =================
API.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(API, { foreignKey: 'user_id', as: 'apiKeys' });

export default API;