// src/controllers/merchantBaseController.js
/**
 * Базовый контроллер с общими CRUD операциями
 * Содержит универсальные методы для всех merchant-моделей
 */
export class MerchantBaseController {
    constructor(Model, modelName, associations = {}) {
        this.Model = Model;
        this.modelName = modelName;
        this.associations = associations; // { include: [...], attributes: [...] }
    }

    /**
     * Создать новый ресурс
     */
    create = async (req, res) => {
        try {
            const user = req.authenticatedUser;
            const createData = this.prepareCreateData(req.body, user);

            if (!this.validateCreateData(createData)) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid data for ${this.modelName.toLowerCase()}`
                });
            }

            const resource = await this.Model.create(createData);

            console.log(`✅ ${this.modelName} created:`, resource.id, 'by user:', user.sol_wallet.slice(0, 8) + '...');

            res.json({
                success: true,
                data: this.formatResource(resource)
            });

        } catch (error) {
            console.error(`❌ Create ${this.modelName} error:`, error);
            res.status(500).json({
                success: false,
                error: 'Server error'
            });
        }
    }

    /**
     * Получить список ресурсов
     */
    getList = async (req, res) => {
        try {
            const user = req.authenticatedUser;
            const whereCondition = this.buildWhereCondition(req, user);

            const resources = await this.Model.findAll({
                where: whereCondition,
                include: this.associations.include || [],
                order: [['created_at', 'DESC']],
                attributes: this.associations.attributes
            });

            console.log(`📊 Retrieved ${resources.length} ${this.modelName.toLowerCase()}s for user:`, user.sol_wallet.slice(0, 8) + '...');

            res.json({
                success: true,
                data: resources.map(resource => this.formatResource(resource))
            });

        } catch (error) {
            console.error(`❌ Get ${this.modelName}s error:`, error);
            res.status(500).json({
                success: false,
                error: 'Server error'
            });
        }
    }

    /**
     * Обновить ресурс
     */
    update = async (req, res) => {
        try {
            const resource = req.authorizedResource;
            const updateData = this.prepareUpdateData(req.body);

            if (!this.validateUpdateData(updateData)) {
                return res.status(400).json({
                    success: false,
                    error: `Invalid data for ${this.modelName.toLowerCase()}`
                });
            }

            await resource.update(updateData);

            console.log(`✅ ${this.modelName} updated:`, resource.id);

            res.json({
                success: true,
                data: this.formatResource(resource)
            });

        } catch (error) {
            console.error(`❌ Update ${this.modelName} error:`, error);
            res.status(500).json({
                success: false,
                error: 'Server error'
            });
        }
    }

    /**
     * Удалить ресурс (мягкое удаление)
     */
    delete = async (req, res) => {
        try {
            const resource = req.authorizedResource;

            // Мягкое удаление - деактивируем ресурс
            await resource.update({ is_active: false });

            // Если есть дочерние ресурсы, деактивируем их тоже
            await this.deactivateChildResources(resource);

            console.log(`🗑️ ${this.modelName} deleted:`, resource.id);

            res.json({
                success: true,
                message: `${this.modelName} deleted successfully`
            });

        } catch (error) {
            console.error(`❌ Delete ${this.modelName} error:`, error);
            res.status(500).json({
                success: false,
                error: 'Server error'
            });
        }
    }

    // ===== Методы для переопределения в дочерних контроллерах =====

    /**
     * Подготовить данные для создания (переопределить в дочерних классах)
     */
    prepareCreateData(body, user) {
        return {
            user_id: user.id,
            ...body
        };
    }

    /**
     * Подготовить данные для обновления (переопределить в дочерних классах)
     */
    prepareUpdateData(body) {
        return body;
    }

    /**
     * Валидация данных для создания (переопределить в дочерних классах)
     */
    validateCreateData(data) {
        return true;
    }

    /**
     * Валидация данных для обновления (переопределить в дочерних классах)
     */
    validateUpdateData(data) {
        return true;
    }

    /**
     * Построить WHERE условие для запроса (переопределить в дочерних классах)
     */
    buildWhereCondition(req, user) {
        return {
            user_id: user.id,
            is_active: true
        };
    }

    /**
     * Деактивировать дочерние ресурсы при удалении (переопределить в дочерних классах)
     */
    async deactivateChildResources(resource) {
        // Базовая реализация - ничего не делаем
        return Promise.resolve();
    }

    /**
     * Форматировать ресурс для ответа (переопределить в дочерних классах)
     */
    formatResource(resource) {
        const plain = resource.get ? resource.get({ plain: true }) : resource;

        return {
            id: plain.id,
            name: plain.name,
            createdAt: plain.created_at,
            updatedAt: plain.updated_at,
            ...this.getAdditionalFields(plain)
        };
    }

    /**
     * Дополнительные поля для форматирования (переопределить в дочерних классах)
     */
    getAdditionalFields(resource) {
        return {};
    }
}