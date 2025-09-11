// src/models/QRCode.js - CLEAN VERSION (only MarketNetwork relation)
import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';
import MarketNetwork from './MarketNetwork.js';

const QRCode = sequelize.define('QRCode', {
    qr_id: {
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
    },
    deleted_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'qr_codes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            fields: ['qr_id']
        },
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

// Relationships
QRCode.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
});

QRCode.belongsTo(MarketNetwork, {
    foreignKey: 'market_network_id',
    as: 'marketNetwork'
});

User.hasMany(QRCode, {
    foreignKey: 'user_id',
    as: 'qrCodes'
});

MarketNetwork.hasMany(QRCode, {
    foreignKey: 'market_network_id',
    as: 'qrCodes'
});

export default QRCode;