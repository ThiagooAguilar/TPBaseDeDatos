require('dotenv').config();

const express = require('express');
const connectMongo = require('./mongodb/connectMongo');
const userActivityRoutes = require('./mongodb/userActivity.route');
const { Pool } = require('pg');

// Dependencias para Autenticación
const bcrypt = require('bcrypt');
const session = require('express-session');

// Construcción de la página con express
const app = express();
const port = process.env.PORT || 3500;

connectMongo();

// Serve static files from the "views" directory
app.use(express.static('views'));
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurar middleware de sesión
app.use(session({
    secret: process.env.SESSION_SECRET || 'mi-clave-secreta-muy-segura-reemplazar',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

app.use('/activity', userActivityRoutes);

// Conexión a PostgreSQL con manejo de errores
const db = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Verificar conexión a PostgreSQL
db.on('error', (err) => {
    console.error('❌ Error en la conexión de PostgreSQL:', err);
});

db.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ No se pudo conectar a PostgreSQL:', err);
    } else {
        console.log('✅ PostgreSQL conectado:', res.rows[0].now);
    }
});

// Importar el servicio y controlador
const MovieUserService = require('./movieUser.service');
const MovieUserController = require('./movieUser.controller');
const UserActivityService = require('./mongodb/userActivity.service');

// Inicializar la instancia del controlador
const movieUserController = new MovieUserController(db, MovieUserService);

// Motor de plantillas
app.set('view engine', 'ejs');

// Middleware de autenticación
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
};

/* =========================
    RUTAS DE MOVIE_USER
========================= */

// Ruta 1: POST para guardar Rating y Opinión (PROTEGIDA)
app.post('/api/movie-user', isAuthenticated, async (req, res) => {
    try {
        await movieUserController.postInteraction(req, res);

        // Registrar actividad en MongoDB (no bloquea si falla)
        const { movie_id, rating, opinion } = req.body;

        if (rating) {
            UserActivityService.registerActivity(
                req.session.userId.toString(),
                'RATED_MOVIE',
                { movieId: movie_id, rating: rating }
            ).catch(err => console.error('⚠️ Error logging activity:', err));
        }

        if (opinion) {
            UserActivityService.registerActivity(
                req.session.userId.toString(),
                'WROTE_REVIEW',
                { movieId: movie_id, reviewLength: opinion.length }
            ).catch(err => console.error('⚠️ Error logging activity:', err));
        }

    } catch (error) {
        console.error('❌ Error en /api/movie-user:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Ruta 2: POST para Favorito (Toggle) (PROTEGIDA)
app.post('/api/movie-user/favorite', isAuthenticated, async (req, res) => {
    try {
        await movieUserController.toggleFavorite(req, res);

        // Registrar actividad en MongoDB
        const { movie_id, favorite } = req.body;

        if (favorite) {
            UserActivityService.registerActivity(
                req.session.userId.toString(),
                'ADDED_TO_FAVORITES',
                { movieId: movie_id }
            ).catch(err => console.error('⚠️ Error logging activity:', err));
        }

    } catch (error) {
        console.error('❌ Error en /api/movie-user/favorite:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

/* =========================
    RUTAS DE AUTENTICACIÓN
========================= */

// GET Registro
app.get('/register', (req, res) => {
    if (req.session.userId) return res.redirect('/');
    res.render('register', { error: req.session.error });
    req.session.error = null;
});

// POST Registro
app.post('/register', async (req, res) => {
    const { user_username, user_name, user_email, user_password } = req.body;

    if (!user_username || !user_name || !user_email || !user_password) {
        req.session.error = 'Todos los campos son obligatorios.';
        return res.redirect('/register');
    }

    try {
        const hash = await bcrypt.hash(user_password, 10);

        const result = await db.query(`
            INSERT INTO public."user" (user_username, user_name, user_email, user_password_hash)
            VALUES ($1, $2, $3, $4)
                RETURNING user_id;
        `, [user_username, user_name, user_email, hash]);

        req.session.userId = result.rows[0].user_id;
        console.log('✅ Usuario registrado:', user_username);
        res.redirect('/');

    } catch (err) {
        console.error('❌ Error en /register:', err);
        let errorMessage = 'Error al intentar registrar.';
        if (err.code === '23505') errorMessage = 'Usuario o email ya existe.';
        req.session.error = errorMessage;
        res.redirect('/register');
    }
});

// GET Login
app.get('/login', (req, res) => {
    if (req.session.userId) return res.redirect('/');
    res.render('login', { error: req.session.error });
    req.session.error = null;
});

// POST Login
app.post('/login', async (req, res) => {
    const { identifier, user_password } = req.body;

    console.log('--- INTENTO DE LOGIN ---');
    console.log('Identificador recibido:', identifier);

    try {
        const result = await db.query(`
            SELECT user_id, user_password_hash
            FROM public."user"
            WHERE user_username ILIKE $1 OR user_email ILIKE $1;
        `, [identifier]);

        const user = result.rows[0];

        if (!user) {
            console.log('❌ Usuario NO encontrado en la DB.');
            req.session.error = 'Credenciales inválidas.';
            return res.redirect('/login');
        }

        console.log('✅ Usuario encontrado. ID:', user.user_id);

        const isMatch = await bcrypt.compare(user_password, user.user_password_hash);
        console.log('Resultado de bcrypt.compare:', isMatch);

        if (isMatch) {
            req.session.userId = user.user_id;
            console.log('✅ Login exitoso.');
            return res.redirect('/');
        }

        req.session.error = 'Credenciales inválidas.';
        res.redirect('/login');

    } catch (err) {
        console.error('❌ Error en la ruta /login:', err);
        req.session.error = 'Error en el servidor.';
        res.redirect('/login');
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
});

/* =========================
       RUTAS PRINCIPALES
========================= */

app.get('/', async (req, res) => {
    try {
        const topRated = await db.query(`
            SELECT movie_id, title, poster_url, vote_average
            FROM movies.movie
            WHERE poster_url IS NOT NULL
            ORDER BY vote_average DESC, vote_count DESC
                LIMIT 20;
        `);

        const recent = await db.query(`
            SELECT movie_id, title, poster_url, vote_average
            FROM movies.movie
            WHERE poster_url IS NOT NULL
            ORDER BY release_date DESC
                LIMIT 20;
        `);

        res.render('index', {
            trendingMovies: recent.rows,
            topRatedMovies: topRated.rows,
            userId: req.session.userId
        });

    } catch (err) {
        console.error('❌ Error en ruta /:', err);
        res.render('index', {
            trendingMovies: [],
            topRatedMovies: [],
            userId: req.session.userId
        });
    }
});

// BUSCAR
app.get('/buscar', async (req, res) => {
    const searchTerm = `%${req.query.q || ''}%`;

    try {
        const movies = await db.query(`
            SELECT * FROM movies.movie WHERE title ILIKE $1 LIMIT 50;
        `, [searchTerm]);

        const actors = await db.query(`
            SELECT DISTINCT p.person_name, p.person_id
            FROM movies.person p
                     JOIN movies.movie_cast mc ON mc.person_id = p.person_id
            WHERE p.person_name ILIKE $1
                LIMIT 20;
        `, [searchTerm]);

        const directors = await db.query(`
            SELECT DISTINCT p.person_name, p.person_id
            FROM movies.movie_crew mc
                     JOIN movies.person p ON mc.person_id = p.person_id
            WHERE mc.job = 'Director' AND p.person_name ILIKE $1
                LIMIT 20;
        `, [searchTerm]);

        res.render('resultado', {
            movies: movies.rows,
            actors: actors.rows,
            directors: directors.rows,
            userId: req.session.userId
        });

    } catch (err) {
        console.error('❌ Error en /buscar:', err);
        res.status(500).send('Error en la búsqueda.');
    }
});

app.get('/search_keyword', (req, res) => {
    const searchTerm = req.query.q || '';
    res.render('search_keyword', {
        query: searchTerm,
        userId: req.session.userId
    });
});

app.get('/buscarpalabras', async (req, res) => {
    const queryTerm = req.query.q;

    if (!queryTerm) {
        return res.redirect('/search_keyword');
    }

    const searchTerm = `%${queryTerm.toLowerCase()}%`;

    const sqlQuery = `
        SELECT DISTINCT ON (m.movie_id)
            m.movie_id,
            m.title,
            m.poster_url,
            m.vote_average 
        FROM movies.movie m
        JOIN movies.movie_keywords mk ON m.movie_id = mk.movie_id
        JOIN movies.keyword k ON mk.keyword_id = k.keyword_id
        WHERE LOWER(k.keyword_name) LIKE $1
        ORDER BY m.movie_id, m.release_date DESC
        LIMIT 100;
    `;

    try {
        const result = await db.query(sqlQuery, [searchTerm]);

        res.render('resultados_keyword', {
            movies: result.rows,
            query: queryTerm,
            userId: req.session.userId
        });

    } catch (error) {
        console.error('❌ Error al buscar películas por palabra clave:', error);
        res.status(500).send('Error interno del servidor al consultar la base de datos.');
    }
});

// DETALLE PELÍCULA (CORREGIDO)
app.get('/pelicula/:id', async (req, res) => {
    const movieId = parseInt(req.params.id); // CONVERTIR A NÚMERO
    const userId = req.session.userId;

    // DEBUGGING
    console.log('--- DETALLE PELÍCULA ---');
    console.log('Movie ID:', movieId);
    console.log('User ID:', userId);

    try {
        // 1. Consulta Principal de Película, Elenco y Equipo
        const movieResult = await db.query(`
            SELECT
                m.*,
                actor.person_name AS actor_name,
                actor.person_id AS actor_id,
                crew.person_name AS crew_member_name,
                crew.person_id AS crew_member_id,
                mc.character_name,
                mc.cast_order,
                d.department_name,
                c.job
            FROM movies.movie m
            LEFT JOIN movies.movie_cast mc ON m.movie_id = mc.movie_id
            LEFT JOIN movies.person actor ON mc.person_id = actor.person_id
            LEFT JOIN movies.movie_crew c ON m.movie_id = c.movie_id
            LEFT JOIN movies.department d ON c.department_id = d.department_id
            LEFT JOIN movies.person crew ON crew.person_id = c.person_id
            WHERE m.movie_id = $1;
        `, [movieId]);

        if (movieResult.rows.length === 0) {
            return res.status(404).send('Película no encontrada.');
        }

        // 2. Procesar Datos de la Película
        const movieData = {
            movie_id: movieResult.rows[0].movie_id, // ⭐ AGREGADO
            title: movieResult.rows[0].title,
            release_date: movieResult.rows[0].release_date,
            overview: movieResult.rows[0].overview,
            poster_url: movieResult.rows[0].poster_url,
            vote_average: movieResult.rows[0].vote_average,
            directors: [],
            writers: [],
            cast: [],
            crew: []
        };

        const processedCastIds = new Set();
        const processedCrewIds = new Set();

        movieResult.rows.forEach(row => {
            // Elenco (cast)
            if (row.actor_id && !processedCastIds.has(row.actor_id)) {
                movieData.cast.push({
                    actor_id: row.actor_id,
                    actor_name: row.actor_name,
                    character_name: row.character_name,
                    cast_order: row.cast_order
                });
                processedCastIds.add(row.actor_id);
            }

            // Equipo (crew)
            if (row.crew_member_id && !processedCrewIds.has(row.crew_member_id)) {
                const crewMember = {
                    crew_member_id: row.crew_member_id,
                    crew_member_name: row.crew_member_name,
                    department_name: row.department_name,
                    job: row.job
                };

                if (row.job === 'Director' && row.department_name === 'Directing') {
                    movieData.directors.push(crewMember);
                } else if (row.job === 'Writer') {
                    movieData.writers.push(crewMember);
                } else {
                    movieData.crew.push(crewMember);
                }

                processedCrewIds.add(row.crew_member_id);
            }
        });

        // 3. Consulta de Interacción del Usuario (movie_user)
        let movieUserData = { rating: null, opinion: null, favorite: false };

        if (userId) {
            const userInteractionResult = await db.query(`
                SELECT rating, opinion, favorite
                FROM movies.movie_user
                WHERE user_id = $1 AND movie_id = $2;
            `, [userId, movieId]);

            if (userInteractionResult.rows.length > 0) {
                const data = userInteractionResult.rows[0];
                movieUserData = {
                    rating: data.rating,
                    opinion: data.opinion,
                    favorite: data.favorite
                };
            }
        }

        // 4. Renderizar la vista
        res.render('pelicula', {
            movie: movieData,
            current_user_id: userId,
            movie_user_data: movieUserData
        });

    } catch (err) {
        console.error('❌ Error en /pelicula/:id:', err);
        res.status(500).send('Error interno del servidor.');
    }
});

// ACTOR
app.get('/actor/:id', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT DISTINCT p.person_name AS actorName, m.*
            FROM movies.movie m
            INNER JOIN movies.movie_cast mc ON m.movie_id = mc.movie_id
            INNER JOIN movies.person p ON p.person_id = mc.person_id
            WHERE mc.person_id = $1;
        `, [req.params.id]);

        const actorName = result.rows[0]?.actorname || '';
        res.render('actor', {
            actorName,
            movies: result.rows,
            userId: req.session.userId
        });

    } catch (err) {
        console.error('❌ Error en /actor/:id:', err);
        res.status(500).send('Error al cargar actor.');
    }
});

// DIRECTOR
app.get('/director/:id', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT DISTINCT p.person_name AS directorName, m.*
            FROM movies.movie m
            INNER JOIN movies.movie_crew mc ON m.movie_id = mc.movie_id
            INNER JOIN movies.person p ON p.person_id = mc.person_id
            WHERE mc.job = 'Director' AND mc.person_id = $1;
        `, [req.params.id]);

        const directorName = result.rows[0]?.directorname || '';
        res.render('director', {
            directorName,
            movies: result.rows,
            userId: req.session.userId
        });

    } catch (err) {
        console.error('❌ Error en /director/:id:', err);
        res.status(500).send('Error al cargar director.');
    }
});

// USUARIOS
app.get('/usuarios', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT user_id, user_username, user_name, user_email
            FROM public."user"
            ORDER BY user_id;
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('❌ Error en /usuarios:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE USUARIO
app.delete('/usuarios/:id', async (req, res) => {
    try {
        const result = await db.query(`
            DELETE FROM public."user"
            WHERE user_id = $1
                RETURNING user_id, user_username, user_name, user_email;
        `, [req.params.id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json({ mensaje: 'Usuario eliminado', usuario: result.rows[0] });

    } catch (err) {
        console.error('❌ Error en DELETE /usuarios/:id:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT USUARIO
app.put('/usuarios/:id', async (req, res) => {
    try {
        const { user_username, user_name, user_email } = req.body;

        let set = [];
        let values = [];
        let i = 1;

        if (user_username) { set.push(`user_username = $${i++}`); values.push(user_username); }
        if (user_name)      { set.push(`user_name = $${i++}`); values.push(user_name); }
        if (user_email)     { set.push(`user_email = $${i++}`); values.push(user_email); }

        if (set.length === 0) {
            return res.status(400).json({ error: 'No hay campos para actualizar' });
        }

        values.push(req.params.id);

        const result = await db.query(`
            UPDATE public."user"
            SET ${set.join(', ')}
            WHERE user_id = $${values.length}
            RETURNING user_id, user_username, user_name, user_email;
        `, values);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json({ mensaje: 'Usuario actualizado', usuario: result.rows[0] });

    } catch (err) {
        console.error('❌ Error en PUT /usuarios/:id:', err);
        res.status(500).json({ error: err.message });
    }
});

// Manejo de errores 404
app.use((req, res) => {
    res.status(404).send('❌ Página no encontrada');
});

// Manejo de errores globales
app.use((err, req, res, next) => {
    console.error('❌ Error no manejado:', err);
    res.status(500).send('Error interno del servidor');
});

app.listen(port, () => {
    console.log(`✅ Servidor corriendo en http://localhost:${port}`);
});