// src/models/Market.js
import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';
import MarketNetwork from './MarketNetwork.js';

const Market = sequelize.define('Market', {
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
    location: {
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
    market_network_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: MarketNetwork,
            key: 'id'
        }
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'markets',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            fields: ['user_id']
        },
        {
            fields: ['market_network_id']
        },
        {
            fields: ['is_active']
        },
        {
            fields: ['user_id', 'market_network_id']
        }
    ]
});

// Связи
Market.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
});

Market.belongsTo(MarketNetwork, {
    foreignKey: 'market_network_id',
    as: 'marketNetwork'
});

User.hasMany(Market, {
    foreignKey: 'user_id',
    as: 'markets'
});

MarketNetwork.hasMany(Market, {
    foreignKey: 'market_network_id',
    as: 'markets'
});

export default Market;