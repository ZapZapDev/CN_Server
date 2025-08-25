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
        unique: true,
        validate: {
            len: [44, 44] // Точно 44 символа для Solana адреса
        }
    },
    session_key: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    last_ip: {
        type: DataTypes.STRING(45),
        allowNull: true
    }
}, {
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            unique: true,
            fields: ['sol_wallet']
        },
        {
            fields: ['session_key']
        },
        {
            fields: ['last_ip']
        }
    ]
});

export default User;