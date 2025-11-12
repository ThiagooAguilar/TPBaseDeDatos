CREATE TABLE movies.movie_user (
    movie_id INT REFERENCES movies.movie(movie_id),
    user_id INT REFERENCES movies.user(user_id),
    rating NUMERIC(2,1),
    opinion TEXT,
    favorite BOOLEAN DEFAULT false,
    PRIMARY KEY (movie_id, user_id)
);