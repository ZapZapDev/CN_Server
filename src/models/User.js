// src/models/User.js - ИСПРАВЛЕННАЯ ВЕРСИЯ (оптимизированные индексы)
import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    sol_wallet: {
        type: DataTypes.STRING(44),
        allowNull: false,
        validate: {
            len: [44, 44]
        }
        // УБРАЛИ unique: true - теперь один кошелек может быть на разных устройствах
    },
    session_key: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    session_hash: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    device_hash: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    last_ip: {
        type: DataTypes.STRING(45),
        allowNull: true
    },
    user_agent_hash: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    last_activity: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    expires_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    suspicious_activity: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    // ИСПРАВЛЕНО: Минимальное количество критически важных индексов
    indexes: [
        // Главный уникальный индекс: кошелек + устройство
        {
            name: 'unique_wallet_device',
            unique: true,
            fields: ['sol_wallet', 'device_hash']
        },
        // Индекс для поиска активных сессий
        {
            name: 'active_sessions_index',
            fields: ['sol_wallet', 'is_active']
        },
        // Индекс для очистки истекших сессий
        {
            name: 'expires_cleanup_index',
            fields: ['expires_at', 'is_active']
        }
    ]
});

export default User;