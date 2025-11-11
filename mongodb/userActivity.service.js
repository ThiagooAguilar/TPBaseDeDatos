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

    static async getUserActivity(userId, page = 1, limit = 20) {        try {
            // calcula cuántos documentos "saltar" (skip)
            // ej: (página 1 - 1) * 20 = 0 (no saltar)
            // ej: (página 2 - 1) * 20 = 20 (saltar los primeros 20)
            const skipAmount = (page - 1) * limit;
            // buscar, ordenar y limitar
            const activities = await UserActivity.find({ userId: userId }) // Filtro
                .sort({ timestamp: -1 }) // ordenar por fecha (más reciente primero)
                .skip(skipAmount)   // la clave de la paginación
                .limit(limit);      // aplicar el límite
            // return la lista
            return activities;
        } catch (error) {
            console.error("Error al obtener actividades:", error);
            throw error;
        }
    }
}

module.exports = UserActivityService;