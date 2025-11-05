CREATE TABLE IF NOT EXISTS movie_user (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES "user"(user_id) ON DELETE CASCADE,
    movie_id INTEGER REFERENCES movie(movie_id) ON DELETE CASCADE,
    rating INTEGER,
    opinion TEXT,
    favorite BOOLEAN DEFAULT FALSE,
    UNIQUE (user_id, movie_id)
);
