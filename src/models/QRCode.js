// src/models/QRCode.js - SEQUENCE NUMBER VERSION
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
    qr_unique_id: {
        type: DataTypes.STRING(5),
        allowNull: false,
        unique: true,
        validate: {
            len: [5, 5],
            is: /^[A-Z0-9]{5}$/
        }
    },
    sequence_number: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 1
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
            name: 'qr_unique_id_index',
            unique: true,
            fields: ['qr_unique_id']
        },
        {
            name: 'network_sequence_index',
            fields: ['market_network_id', 'sequence_number']
        },
        {
            fields: ['user_id']
        },
        {
            fields: ['is_active']
        }
    ],
    hooks: {
        beforeValidate: async (qrCode) => {
            if (!qrCode.qr_unique_id) {
                qrCode.qr_unique_id = await QRCode.generateUniqueId();
            }
        }
    }
});

// Static method for generating unique ID
QRCode.generateUniqueId = async function() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
        let id = '';
        for (let i = 0; i < 5; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        const existing = await this.findOne({
            where: { qr_unique_id: id },
            attributes: ['qr_unique_id']
        });

        if (!existing) return id;
        attempts++;
    }

    throw new Error('Failed to generate unique QR ID');
};

// Get next sequence number for network
QRCode.getNextSequenceNumber = async function(marketNetworkId) {
    const lastQR = await this.findOne({
        where: {
            market_network_id: marketNetworkId,
            is_active: true
        },
        order: [['sequence_number', 'DESC']],
        attributes: ['sequence_number']
    });

    return (lastQR?.sequence_number || 0) + 1;
};

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