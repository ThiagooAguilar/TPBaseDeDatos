CREATE TABLE IF NOT EXISTS movies.movie_user (
                                                 id SERIAL PRIMARY KEY,
                                                 user_id INTEGER REFERENCES public."user"(user_id) ON DELETE CASCADE,
                                                 movie_id INTEGER REFERENCES movies.movie(movie_id) ON DELETE CASCADE,
                                                 rating INTEGER,
                                                 opinion TEXT,
                                                 favorite BOOLEAN DEFAULT FALSE,
                                                 UNIQUE (user_id, movie_id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);