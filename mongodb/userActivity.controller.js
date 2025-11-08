const UserActivityService = require('./userActivity.service');

class UserActivityController {

    // maneja POST /register
    static async post(req, res) {
        try {
            // extrae los datos del body
            const {userId, type, details} = req.body;

            if (!userId || !type || !details) {
                return res.status(400).json({error: "Faltan datos requeridos"});
            }

            // llama al servicio
            const result = await UserActivityService.registerActivity(userId, type, details);
            res.status(201).json(result);

        } catch (error) {
            console.error("Error en controlador POST:", error.message);
            res.status(500).json({error: error.message || "Error interno del servidor"});
        }
    }

    // maneja GET
    static async get(req, res) {
        try {
        // saca los datos de la URL
        const { userId } = req.params;
        const { limit } = req.query;

        if (!userId) {
            return res.status(400).json({ error: "Falta el parámetro userId" });
        }

        // llama al servicio
        const activities = await UserActivityService.getUserActivity(userId, limit);

        if (!activities || activities.length === 0) {
            return res.status(404).json({ message: "No se encontró actividad para este usuario" });
        }
        res.status(200).json(activities);

        } catch (error) {
            console.error("Error en controlador GET:", error.message);
            res.status(500).json({ error: error.message || "Error interno del servidor" });
        }
    }
}

module.exports = UserActivityController;