const UserActivity = require('./userActivity.model');

class UserActivityService {
    static async registerActivity(userId, type, details) {
        try {
            // crear y guardar en una sola línea
            const NewActivity = await UserActivity.create({
                userId: userId,   // guardamos el ID del usuario
                type: type,       // guardamos el tipo de actividad
                details: details  // guardamos los detalles
            });

            // return el resultado
            return NewActivity;
        } catch (error) {
            console.error("Error al registrar:", error);
            throw error; // avisa que hubo un error
        }
    }

    static async getUserActivity(userId, limit = 20) {
        try {
            // buscar, ordenar y limitar
            const activities = await UserActivity.find({ userId: userId }) // Filtro
                .sort({ timestamp: -1 }) // ordenar por fecha (más reciente primero)
                .limit(limit);           // limitar cantidad

            // return la lista
            return activities;
        } catch (error) {
            console.error("Error al obtener actividades:", error);
            throw error;
        }
    }
}

module.exports = UserActivityService;