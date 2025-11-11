class MovieUserService {
    static async upsertRatingOpinion(db, userId, movieId, rating, opinion) {
        const query = `
            INSERT INTO movies.movie_user (user_id, movie_id, rating, opinion, created_at, updated_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, movie_id)
            DO UPDATE SET
                rating = COALESCE(EXCLUDED.rating, movies.movie_user.rating),
                opinion = COALESCE(EXCLUDED.opinion, movies.movie_user.opinion),
                updated_at = CURRENT_TIMESTAMP
            RETURNING *;
        `;

        try {
            const result = await db.query(query, [userId, movieId, rating, opinion]);
            return result.rows[0];
        } catch (error) {
            console.error('❌ Error en upsertRatingOpinion:', error);
            throw error;
        }
    }

    static async toggleFavorite(db, userId, movieId, favorite) {
        const query = `
            INSERT INTO movies.movie_user (user_id, movie_id, favorite, created_at, updated_at)
            VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, movie_id)
            DO UPDATE SET
                favorite = EXCLUDED.favorite,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *;
        `;

        try {
            const result = await db.query(query, [userId, movieId, favorite]);
            return result.rows[0];
        } catch (error) {
            console.error('❌ Error en toggleFavorite:', error);
            throw error;
        }
    }

    static async getUserMovieData(db, userId, movieId) {
        const query = `
            SELECT rating, opinion, favorite, created_at, updated_at
            FROM movies.movie_user
            WHERE user_id = $1 AND movie_id = $2;
        `;

        try {
            const result = await db.query(query, [userId, movieId]);
            return result.rows[0] || {
                rating: null,
                opinion: null,
                favorite: false,
                created_at: null,
                updated_at: null
            };
        } catch (error) {
            console.error('❌ Error en getUserMovieData:', error);
            throw error;
        }
    }
}

module.exports = MovieUserService;