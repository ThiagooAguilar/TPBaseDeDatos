// movieUser.controller.js
const MovieUserService = require('./movieUser.service');

class MovieUserController {
    constructor(db, service) {
        this.db = db;
        this.service = service;
    }

    async postInteraction(req, res) {
        const { user_id, movie_id, rating, opinion } = req.body;
        const actualUserId = req.session.userId;

        // VALIDACIONES
        if (!actualUserId) {
            console.error('❌ postInteraction: Usuario no autenticado');
            return res.status(401).json({
                error: "Usuario no autenticado. Por favor, inicie sesión.",
                redirect: '/login'
            });
        }

        if (actualUserId != user_id) {
            console.error('❌ postInteraction: user_id no coincide con sesión');
            return res.status(403).json({
                error: "Acción no autorizada."
            });
        }

        if (!movie_id) {
            console.error('❌ postInteraction: Falta movie_id');
            return res.status(400).json({
                error: "Falta el ID de la película."
            });
        }

        // CONVERSIONES
        const finalRating = (rating === null || rating === '' || rating === undefined)
            ? null
            : parseInt(rating);

        const finalOpinion = (opinion === null || opinion === '' || opinion === undefined)
            ? null
            : opinion.trim();

        // VALIDACIÓN DE RATING
        if (finalRating !== null && (finalRating < 1 || finalRating > 10)) {
            console.error('❌ postInteraction: Rating fuera de rango');
            return res.status(400).json({
                error: "La puntuación debe estar entre 1 y 10."
            });
        }

        try {
            console.log('✅ Guardando interacción:', {
                userId: actualUserId,
                movieId: movie_id,
                rating: finalRating,
                opinionLength: finalOpinion?.length || 0
            });

            await this.service.upsertRatingOpinion(
                this.db,
                actualUserId,
                movie_id,
                finalRating,
                finalOpinion
            );

            res.status(200).json({
                success: true,
                message: "Interacción guardada con éxito."
            });

        } catch (error) {
            console.error("❌ Error al guardar rating/opinión:", error.message);
            res.status(500).json({
                error: "Error al guardar la interacción.",
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }

    async toggleFavorite(req, res) {
        const { user_id, movie_id, favorite } = req.body;
        const actualUserId = req.session.userId;

        // VALIDACIONES
        if (!actualUserId) {
            console.error('❌ toggleFavorite: Usuario no autenticado');
            return res.status(401).json({
                error: "Usuario no autenticado. Por favor, inicie sesión.",
                redirect: '/login'
            });
        }

        if (actualUserId != user_id) {
            console.error('❌ toggleFavorite: user_id no coincide con sesión');
            return res.status(403).json({
                error: "Acción no autorizada."
            });
        }

        if (!movie_id || typeof favorite !== 'boolean') {
            console.error('❌ toggleFavorite: Datos inválidos');
            return res.status(400).json({
                error: "Faltan datos requeridos (movie_id o estado favorito)."
            });
        }

        try {
            console.log('✅ Actualizando favorito:', {
                userId: actualUserId,
                movieId: movie_id,
                favorite
            });

            await this.service.toggleFavorite(
                this.db,
                actualUserId,
                movie_id,
                favorite
            );

            res.status(200).json({
                success: true,
                message: "Favorito actualizado con éxito."
            });

        } catch (error) {
            console.error("❌ Error al actualizar favorito:", error.message);
            res.status(500).json({
                error: "Error al actualizar favorito.",
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
}

module.exports = MovieUserController;