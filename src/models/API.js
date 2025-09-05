// src/models/API.js
import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';
import crypto from 'crypto';

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
        validate: {
            len: [64, 64]
        }
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: User,
            key: 'id'
        }
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        defaultValue: 'Default API Key',
        validate: {
            len: [1, 255]
        }
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
        validate: {
            min: 1,
            max: 10000
        }
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
    indexes: [
        {
            unique: true,
            fields: ['api_key']
        },
        {
            fields: ['user_id']
        },
        {
            fields: ['is_active']
        },
        {
            fields: ['expires_at']
        }
    ],
    hooks: {
        beforeCreate: (apiKey) => {
            if (!apiKey.api_key) {
                apiKey.api_key = generateSecureApiKey();
            }
        }
    }
});

// Static method to generate secure API key
function generateSecureApiKey() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(32).toString('hex');
    return `cn_${timestamp}_${random}`.substring(0, 64);
}

// Instance methods
API.prototype.isValid = function() {
    if (!this.is_active) return false;
    if (this.expires_at && new Date() > this.expires_at) return false;
    return true;
};

API.prototype.recordUsage = async function() {
    this.usage_count += 1;
    this.last_used_at = new Date();
    await this.save();
};

// Static methods
API.generateApiKey = generateSecureApiKey;

API.findValidKey = async function(apiKey) {
    const key = await this.findOne({
        where: { api_key: apiKey },
        include: [{
            model: User,
            as: 'user',
            required: true
        }]
    });

    return key?.isValid() ? key : null;
};

// Associations
API.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
});

User.hasMany(API, {
    foreignKey: 'user_id',
    as: 'apiKeys'
});

export default API;