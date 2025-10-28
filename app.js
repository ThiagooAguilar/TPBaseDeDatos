// Se debe crear archivo .env con las variables de entorno de la base de datos
// DB_USER=postgres
// DB_PASSWORD=<password_de_la_base_de_datos>
// DB_HOST=localhost
// DB_PORT=5432
// DB_DATABASE=movies

require('dotenv').config();

const express = require('express');

const { Pool } = require('pg');

// contruccion de la pagina con express
const app = express();
const port = process.env.PORT || 3500;

// Serve static files from the "views" directory
app.use(express.static('views'));

// Crear un "pool" de conexiones a PostgreSQL usando las variables de entorno
const db = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    options: `-c search_path=movies,public`, //modificar options de acuerdo al nombre del esquema
});

// Configurar el motor de plantillas EJS
app.set('view engine', 'ejs');

// Ruta para la página de inicio
app.get('/', (req, res) => {
    res.render('index');
});

// Ruta para buscar películas en la base de datos PostgreSQL
app.get('/buscar', async (req, res) => { // 4. Convertir a función async
    const searchTerm = req.query.q;

    // Los placeholders en pg son $1, $2, etc.
    const mov = 'SELECT * FROM movie WHERE title ILIKE $1'; // ILIKE es case-insensitive en Postgres
    const act = `SELECT DISTINCT p.person_name
        FROM movie_cast mc
        JOIN movies.person p ON mc.person_id = p.person_id
        WHERE p.person_name ILIKE $1`;

    const dir = `SELECT DISTINCT p.person_name
        FROM movies.movie_crew mc
        JOIN movies.person p ON mc.person_id = p.person_id
        WHERE mc.job = 'Director' AND p.person_name ILIKE $1`;

    const values = [`%${searchTerm}%`];


    try {
        // Usar db.query que devuelve una promesa y acceder a .rows
        const movies = await db.query(mov, values);
        const actors = await db.query(act, values);
        const directors = await db.query(dir, values);


        // le paso al express de pagina resultado los resultados que voy teniendo
        res.render('resultado', {
            movies: movies.rows,
            actors: actors.rows,
            directors: directors.rows,
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Error en la búsqueda.');
    }
});

// Ruta para la página de datos de una película particular (PostgreSQL)
app.get('/pelicula/:id', async (req, res) => { // Convertir a async
    const movieId = req.params.id;

    const query = `
    SELECT
      movie.*,
      actor.person_name as actor_name,
      actor.person_id as actor_id,
      crew_member.person_name as crew_member_name,
      crew_member.person_id as crew_member_id,
      movie_cast.character_name,
      movie_cast.cast_order,
      department.department_name,
      movie_crew.job
    FROM movie
    LEFT JOIN movie_cast ON movie.movie_id = movie_cast.movie_id
    LEFT JOIN person as actor ON movie_cast.person_id = actor.person_id
    LEFT JOIN movie_crew ON movie.movie_id = movie_crew.movie_id
    LEFT JOIN department ON movie_crew.department_id = department.department_id
    LEFT JOIN person as crew_member ON crew_member.person_id = movie_crew.person_id
    WHERE movie.movie_id = $1
  `;

    try {
        const result = await db.query(query, [movieId]);
        const rows = result.rows;

        if (rows.length === 0) {
            return res.status(404).send('Película no encontrada.');
        }

        const movieData = {
            id: rows[0].id,
            title: rows[0].title,
            release_date: rows[0].release_date,
            overview: rows[0].overview,
            directors: [],
            writers: [],
            cast: [],
            crew: [],
        };

        rows.forEach((row) => {
            if (row.crew_member_id && row.crew_member_name && row.department_name && row.job) {
                const isDuplicate = movieData.directors.some((crew_member) => crew_member.crew_member_id === row.crew_member_id);
                if (!isDuplicate && row.department_name === 'Directing' && row.job === 'Director') {
                    movieData.directors.push({
                        crew_member_id: row.crew_member_id,
                        crew_member_name: row.crew_member_name,
                        department_name: row.department_name,
                        job: row.job,
                    });
                }
            }
        });

        rows.forEach((row) => {
            if (row.crew_member_id && row.crew_member_name && row.department_name && row.job) {
                const isDuplicate = movieData.writers.some((crew_member) => crew_member.crew_member_id === row.crew_member_id);
                if (!isDuplicate && row.department_name === 'Writing' && (row.job === 'Writer' || row.job === 'Screenplay')) { // Ajuste para más roles de escritura
                    movieData.writers.push({
                        crew_member_id: row.crew_member_id,
                        crew_member_name: row.crew_member_name,
                        department_name: row.department_name,
                        job: row.job,
                    });
                }
            }
        });

        rows.forEach((row) => {
            if (row.actor_id && row.actor_name && row.character_name) {
                const isDuplicate = movieData.cast.some((actor) => actor.actor_id === row.actor_id);
                if (!isDuplicate) {
                    movieData.cast.push({
                        actor_id: row.actor_id,
                        actor_name: row.actor_name,
                        character_name: row.character_name,
                        cast_order: row.cast_order,
                    });
                }
            }
        });

        rows.forEach((row) => {
            if (row.crew_member_id && row.crew_member_name && row.department_name && row.job) {
                const isDuplicate = movieData.crew.some((crew_member) => crew_member.crew_member_id === row.crew_member_id);
                if (!isDuplicate) {
                    if (row.department_name !== 'Directing' && row.department_name !== 'Writing') {
                        movieData.crew.push({
                            crew_member_id: row.crew_member_id,
                            crew_member_name: row.crew_member_name,
                            department_name: row.department_name,
                            job: row.job,
                        });
                    }
                }
            }
        });

        res.render('pelicula', { movie: movieData });

    } catch (err) {
        console.error(err);
        res.status(500).send('Error al cargar los datos de la película.');
    }
});

// Ruta para mostrar la página de un actor específico (PostgreSQL)
app.get('/actor/:id', async (req, res) => {
    const actorId = req.params.id;

    const query = `
    SELECT DISTINCT
      person.person_name as actorName,
      movie.*
    FROM movie
    INNER JOIN movie_cast ON movie.movie_id = movie_cast.movie_id
    INNER JOIN person ON person.person_id = movie_cast.person_id
    WHERE movie_cast.person_id = $1;
  `;

    try {
        const result = await db.query(query, [actorId]);
        const movies = result.rows;
        const actorName = movies.length > 0 ? movies[0].actorname : ''; // Ojo: postgres devuelve todo en minúsculas por defecto
        res.render('actor', { actorName, movies });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al cargar las películas del actor.');
    }
});

// Ruta para mostrar la página de un director específico (PostgreSQL)
app.get('/director/:id', async (req, res) => {
    const directorId = req.params.id;

    const query = `
    SELECT DISTINCT
      person.person_name as directorName,
      movie.*
    FROM movie
    INNER JOIN movie_crew ON movie.movie_id = movie_crew.movie_id
    INNER JOIN person ON person.person_id = movie_crew.person_id
    WHERE movie_crew.job = 'Director' AND movie_crew.person_id = $1;
  `;

    try {
        const result = await db.query(query, [directorId]);
        const movies = result.rows;
        const directorName = movies.length > 0 ? movies[0].directorname : ''; // Ojo: postgres devuelve todo en minúsculas por defecto
        res.render('director', { directorName, movies });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al cargar las películas del director.');
    }
});


app.listen(port, () => {
    console.log(`Servidor en ejecución en http://localhost:${port}`);
});
