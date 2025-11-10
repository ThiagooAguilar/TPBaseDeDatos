// movieUser.service.js
class MovieUserService {

    /**
     * Guarda o actualiza la puntuación y opinión de un usuario para una película (UPSERT).
     */
    static async upsertRatingOpinion(db, userId, movieId, rating, opinion) {
        try {
            // ⚠️ CORRECCIÓN: Usar db.query(...) NO db.query`...`
            const result = await db.query(
                `INSERT INTO movies.movie_user (user_id, movie_id, rating, opinion)
                 VALUES ($1, $2, $3, $4)
                     ON CONFLICT (user_id, movie_id) 
                 DO UPDATE SET
                    rating = EXCLUDED.rating,
                                             opinion = EXCLUDED.opinion,
                                             updated_at = NOW()
                                             RETURNING *;`,
                [userId, movieId, rating, opinion]
            );

            console.log('✅ Interacción guardada:', result.rows[0]);
            return result.rows[0];

        } catch (error) {
            console.error("❌ Error en upsertRatingOpinion:", error);

            // Errores específicos de PostgreSQL
            if (error.code === '23503') {
                throw new Error("La película o usuario no existe.");
            }
            if (error.code === '23505') {
                throw new Error("Ya existe una interacción para esta película.");
            }

            throw new Error("No se pudo guardar la interacción.");
        }
    }

    /**
     * Actualiza el estado de favorito (True/False) (UPSERT).
     */
    static async toggleFavorite(db, userId, movieId, favoriteStatus) {
        try {
            // ⚠️ CORRECCIÓN: Usar db.query(...) NO db.query`...`
            const result = await db.query(
                `INSERT INTO movies.movie_user (user_id, movie_id, favorite)
                 VALUES ($1, $2, $3)
                     ON CONFLICT (user_id, movie_id) 
                 DO UPDATE SET
                    favorite = EXCLUDED.favorite,
                                             updated_at = NOW()
                                             RETURNING *;`,
                [userId, movieId, favoriteStatus]
            );

            console.log('✅ Favorito actualizado:', result.rows[0]);
            return result.rows[0];

        } catch (error) {
            console.error("❌ Error en toggleFavorite:", error);

            // Errores específicos de PostgreSQL
            if (error.code === '23503') {
                throw new Error("La película o usuario no existe.");
            }

            throw new Error("No se pudo actualizar el estado de favorito.");
        }
    }
}

module.exports = MovieUserService;