// src/models/Table.js
import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';
import User from './User.js';
import Market from './Market.js';

const Table = sequelize.define('Table', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    number: {
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
    market_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Market,
            key: 'id'
        }
    }
}, {
    tableName: 'tables',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        {
            fields: ['user_id']
        },
        {
            fields: ['market_id']
        },
        {
            fields: ['user_id', 'market_id']
        },
        {
            unique: true,
            fields: ['market_id', 'number'],
            name: 'unique_market_table_number'
        }
    ]
});

// Связи
Table.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
});

Table.belongsTo(Market, {
    foreignKey: 'market_id',
    as: 'market'
});

User.hasMany(Table, {
    foreignKey: 'user_id',
    as: 'tables'
});

Market.hasMany(Table, {
    foreignKey: 'market_id',
    as: 'tables'
});

export default Table;