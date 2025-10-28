-- Esta es la query para el app.get(/buscar). Pense en hacerlo de manera que si falla la
-- primera busqueda (mov, act, dir), busque entonces por movtag, no se si es asi

--MOVTAG:

--TABLA QUE BUSCA LAS PELICULAS ASOCIADAS A ESA KEYWORD

WITH keyword_in_movie_table AS (SELECT m.*, k.keyword_id, k.keyword_name
FROM movie m
         LEFT JOIN movie_keywords mk ON m.movie_id = mk.movie_id
         LEFT JOIN keyword k ON mk.keyword_id = k.keyword_id)

SELECT *
FROM keyword_in_movie_table
--WHERE keyword_name ILIKE $1; LO COMENTO PARA QUE NO TIRE ERROR AL PUSHEAR

--EJEMPLO: LAS PELICULAS QUE TIENE LA KEYWORD italy

WITH keyword_in_movie_table AS (SELECT m.*, k.keyword_id, k.keyword_name
                                FROM movie m
                                         LEFT JOIN movie_keywords mk ON m.movie_id = mk.movie_id
                                         LEFT JOIN keyword k ON mk.keyword_id = k.keyword_id)

SELECT *
FROM keyword_in_movie_table
WHERE keyword_name = 'italy';
