const UserActivityService = require('./userActivity.service');

class UserActivityController {

    // maneja POST /register
    static async post(req, res) {
        // extrae los datos del body
        const { userId, type, details } = req.body;

        // llama al servicio
        const result = await UserActivityService.registerActivity(userId, type, details);

        res.json(result);
    }

    // maneja GET
    static async get(req, res) {
        // saca los datos de la URL
        const { userId } = req.params;
        const { limit } = req.query;

        // llama al servicio
        const activities = await UserActivityService.getUserActivity(userId, limit);

        // devuelve la respuesta
        res.json(activities);
    }
}

module.exports = UserActivityController;