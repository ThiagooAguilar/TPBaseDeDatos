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
        // lee 'page' y 'limit' del query string (la URL)
        // si no vienen, usa valores por defecto: página 1, límite 20.
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        if (!userId) {
            return res.status(400).json({ error: "Falta el parámetro userId" });
        }

        // llama al servicio
        const activities = await UserActivityService.getUserActivity(userId, page, limit);

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