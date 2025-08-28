// src/models/MarketNetwork.js
import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';

const MarketNetwork = sequelize.define('MarketNetwork', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
            notEmpty: true,
            len: [1, 255]
        }
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: User,
            key: 'id'
        }
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'market_networks',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            fields: ['user_id']
        },
        {
            fields: ['is_active']
        },
        {
            fields: ['user_id', 'is_active']
        }
    ]
});

// Связи
MarketNetwork.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
});

User.hasMany(MarketNetwork, {
    foreignKey: 'user_id',
    as: 'marketNetworks'
});

export default MarketNetwork;