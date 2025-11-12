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

        // Opción 1: Si usas pg (node-postgres)
        const result = await db.query(
            'INSERT INTO public."user" (user_username, user_name, user_email, user_password_hash) VALUES ($1, $2, $3, $4) RETURNING user_id',
            [user_username, user_name, user_email, hash]
        );

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
    const searchTerm = req.query.q;

    if (!searchTerm) {
        return res.redirect('/search_keyword');
    }

    const query = `
        SELECT DISTINCT ON (m.movie_id)
            m.movie_id,
            m.title,
            m.poster_url,
            m.vote_average
        FROM movies.movie m
            LEFT JOIN movies.movie_keywords mk ON m.movie_id = mk.movie_id
            LEFT JOIN movies.keyword k ON mk.keyword_id = k.keyword_id
        WHERE k.keyword_name ILIKE $1
        ORDER BY m.movie_id
    `;

    try {
        const result = await db.query(query, [`%${searchTerm}%`]);

        res.render('resultados_keyword', {
            movies: result.rows,
            searchTerm,
            userId: req.session.userId
        });

    } catch (err) {
        console.error('❌ Error en búsqueda por palabras clave:', err);
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

// DETALLE PELÍCULA - VERSIÓN COMPLETA CON TODA LA INFO
app.get('/pelicula/:id', async (req, res) => {
    const movieId = parseInt(req.params.id);
    const userId = req.session.userId;

    console.log('--- DETALLE PELÍCULA COMPLETO ---');
    console.log('Movie ID:', movieId);
    console.log('User ID:', userId);

    try {
        // 1. Información básica de la película
        const movieResult = await db.query(`
            SELECT *
            FROM movies.movie
            WHERE movie_id = $1;
        `, [movieId]);

        if (movieResult.rows.length === 0) {
            return res.status(404).send('Película no encontrada.');
        }

        const movieData = movieResult.rows[0];

        // 2. Géneros
        const genresResult = await db.query(`
            SELECT g.genre_name
            FROM movies.movie_genres mg
            JOIN movies.genre g ON mg.genre_id = g.genre_id
            WHERE mg.movie_id = $1;
        `, [movieId]);

        // 3. Palabras clave (keywords)
        const keywordsResult = await db.query(`
            SELECT k.keyword_name
            FROM movies.movie_keywords mk
            JOIN movies.keyword k ON mk.keyword_id = k.keyword_id
            WHERE mk.movie_id = $1
        `, [movieId]);

        // 4. Idiomas
        const languagesResult = await db.query(`
            SELECT l.language_name, lr.language_role
            FROM movies.movie_languages ml
            JOIN movies.language l ON ml.language_id = l.language_id
            LEFT JOIN movies.language_role lr ON ml.language_role_id = lr.role_id
            WHERE ml.movie_id = $1;
        `, [movieId]);

        // 5. Países de producción
        const countriesResult = await db.query(`
            SELECT c.country_name
            FROM movies.production_country pc
            JOIN movies.country c ON pc.country_id = c.country_id
            WHERE pc.movie_id = $1;
        `, [movieId]);

        // 6. Compañías de producción
        const companiesResult = await db.query(`
            SELECT pc.company_name
            FROM movies.movie_company mc
            JOIN movies.production_company pc ON mc.company_id = pc.company_id
            WHERE mc.movie_id = $1;
        `, [movieId]);

        // 7. Elenco (Cast) con fotos
        const castResult = await db.query(`
            SELECT 
                p.person_id,
                p.person_name,
                p.profile_url,
                mc.character_name,
                mc.cast_order
            FROM movies.movie_cast mc
            JOIN movies.person p ON mc.person_id = p.person_id
            WHERE mc.movie_id = $1
            ORDER BY mc.cast_order
        `, [movieId]);

        // 8. Equipo técnico (Crew) - Directores
        const directorsResult = await db.query(`
            SELECT 
                p.person_id,
                p.person_name,
                p.profile_url
            FROM movies.movie_crew mc
            JOIN movies.person p ON mc.person_id = p.person_id
            WHERE mc.movie_id = $1 AND mc.job = 'Director';
        `, [movieId]);

        // 9. Equipo técnico (Crew) - Escritores
        const writersResult = await db.query(`
            SELECT 
                p.person_id,
                p.person_name,
                p.profile_url
            FROM movies.movie_crew mc
            JOIN movies.person p ON mc.person_id = p.person_id
            WHERE mc.movie_id = $1 AND mc.job = 'Writer';
        `, [movieId]);

        // 10. Equipo técnico (Crew) - Resto del equipo
        const crewResult = await db.query(`
            SELECT 
                p.person_id,
                p.person_name,
                d.department_name,
                mc.job
            FROM movies.movie_crew mc
            JOIN movies.person p ON mc.person_id = p.person_id
            JOIN movies.department d ON mc.department_id = d.department_id
            WHERE mc.movie_id = $1 
                AND mc.job NOT IN ('Director', 'Writer')
            ORDER BY d.department_name, mc.job
        `, [movieId]);

        // 11. Interacción del usuario (movie_user)
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

        // 12. Preparar objeto completo para renderizar
        const completeMovieData = {
            // Datos básicos
            movie_id: movieData.movie_id,
            title: movieData.title,
            original_title: movieData.original_title,
            tagline: movieData.tagline,
            overview: movieData.overview,
            release_date: movieData.release_date,
            runtime: movieData.runtime,
            budget: movieData.budget,
            revenue: movieData.revenue,
            vote_average: movieData.vote_average,
            vote_count: movieData.vote_count,
            popularity: movieData.popularity,
            poster_url: movieData.poster_url,
            backdrop_url: movieData.backdrop_url,
            homepage_url: movieData.homepage_url,
            status: movieData.status,

            // Datos relacionados
            genres: genresResult.rows,
            keywords: keywordsResult.rows,
            languages: languagesResult.rows,
            countries: countriesResult.rows,
            companies: companiesResult.rows,
            cast: castResult.rows,
            directors: directorsResult.rows,
            writers: writersResult.rows,
            crew: crewResult.rows
        };

        // 13. Renderizar la vista
        res.render('pelicula', {
            movie: completeMovieData,
            current_user_id: userId,
            movie_user_data: movieUserData
        });

    } catch (err) {
        console.error('❌ Error en /pelicula/:id:', err);
        res.status(500).send('Error interno del servidor.');
    }
});
/* =========================
    RUTAS DE PERFIL DE USUARIO
========================= */

// Ruta: Ver MI perfil (usuario logueado)
app.get('/perfil', isAuthenticated, async (req, res) => {
    const userId = req.session.userId;

    try {
        // 1. Obtener información del usuario
        const userResult = await db.query(`
            SELECT user_id, user_username, user_name, user_email
            FROM public."user"
            WHERE user_id = $1;
        `, [userId]);

        if (userResult.rows.length === 0) {
            return res.status(404).send('Usuario no encontrado.');
        }

        const user = userResult.rows[0];

        // 2. Obtener películas con calificación (ratings)
        const ratingsResult = await db.query(`
            SELECT 
                mu.movie_id,
                mu.rating,
                m.title,
                m.poster_url
            FROM movies.movie_user mu
            JOIN movies.movie m ON mu.movie_id = m.movie_id
            WHERE mu.user_id = $1 AND mu.rating IS NOT NULL
            ORDER BY mu.rating DESC;
        `, [userId]);

        // 3. Obtener películas con reseñas
        const reviewsResult = await db.query(`
            SELECT 
                mu.movie_id,
                mu.rating,
                mu.opinion,
                m.title,
                m.poster_url
            FROM movies.movie_user mu
            JOIN movies.movie m ON mu.movie_id = m.movie_id
            WHERE mu.user_id = $1 AND mu.opinion IS NOT NULL AND mu.opinion != ''
            ORDER BY mu.movie_id DESC;
        `, [userId]);

        // 4. Obtener películas favoritas
        const favoritesResult = await db.query(`
            SELECT 
                mu.movie_id,
                mu.rating,
                m.title,
                m.poster_url
            FROM movies.movie_user mu
            JOIN movies.movie m ON mu.movie_id = m.movie_id
            WHERE mu.user_id = $1 AND mu.favorite = true
            ORDER BY mu.movie_id DESC;
        `, [userId]);

        // 5. Renderizar la vista
        res.render('perfil', {
            user: user,
            ratings: ratingsResult.rows,
            reviews: reviewsResult.rows,
            favorites: favoritesResult.rows,
            userId: userId
        });

    } catch (err) {
        console.error('❌ Error en /perfil:', err);
        res.status(500).send('Error al cargar el perfil.');
    }
});

// Ruta: Ver perfil de OTRO usuario (opcional)
app.get('/usuario/:id', async (req, res) => {
    const profileUserId = parseInt(req.params.id);

    try {
        // 1. Obtener información del usuario
        const userResult = await db.query(`
            SELECT user_id, user_username, user_name, user_email
            FROM public."user"
            WHERE user_id = $1;
        `, [profileUserId]);

        if (userResult.rows.length === 0) {
            return res.status(404).send('Usuario no encontrado.');
        }

        const user = userResult.rows[0];

        // 2. Obtener películas con calificación (ratings)
        const ratingsResult = await db.query(`
            SELECT 
                mu.movie_id,
                mu.rating,
                m.title,
                m.poster_url
            FROM movies.movie_user mu
            JOIN movies.movie m ON mu.movie_id = m.movie_id
            WHERE mu.user_id = $1 AND mu.rating IS NOT NULL
            ORDER BY mu.rating DESC;
        `, [profileUserId]);

        // 3. Obtener películas con reseñas (solo públicas, opcional)
        const reviewsResult = await db.query(`
            SELECT 
                mu.movie_id,
                mu.rating,
                mu.opinion,
                m.title,
                m.poster_url
            FROM movies.movie_user mu
            JOIN movies.movie m ON mu.movie_id = m.movie_id
            WHERE mu.user_id = $1 AND mu.opinion IS NOT NULL AND mu.opinion != ''
            ORDER BY mu.movie_id DESC;
        `, [profileUserId]);

        // 4. Obtener películas favoritas
        const favoritesResult = await db.query(`
            SELECT 
                mu.movie_id,
                mu.rating,
                m.title,
                m.poster_url
            FROM movies.movie_user mu
            JOIN movies.movie m ON mu.movie_id = m.movie_id
            WHERE mu.user_id = $1 AND mu.favorite = true
            ORDER BY mu.movie_id DESC;
        `, [profileUserId]);

        // 5. Renderizar la vista
        res.render('perfil', {
            user: user,
            ratings: ratingsResult.rows,
            reviews: reviewsResult.rows,
            favorites: favoritesResult.rows,
            userId: req.session.userId // Usuario logueado
        });

    } catch (err) {
        console.error('❌ Error en /usuario/:id:', err);
        res.status(500).send('Error al cargar el perfil.');
    }
});

// ACTOR
app.get('/actor/:id', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                p.person_name,
                m.movie_id,
                m.title,
                m.poster_url,
                m.vote_average,
                m.release_date
            FROM movies.movie m
                     INNER JOIN movies.movie_cast mc ON m.movie_id = mc.movie_id
                     INNER JOIN movies.person p ON p.person_id = mc.person_id
            WHERE mc.person_id = $1
            ORDER BY m.release_date DESC;
        `, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).send('Actor no encontrado o sin películas.');
        }

        const actorName = result.rows[0].person_name;

        res.render('actor', {
            actorName: actorName,
            movies: result.rows,
            userId: req.session.userId
        });

    } catch (err) {
        console.error('❌ Error en /actor/:id:', err);
        res.status(500).send('Error al cargar actor.');
    }
});

// DIRECTOR - RUTA CORREGIDA
app.get('/director/:id', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT
                p.person_name,
                m.movie_id,
                m.title,
                m.poster_url,
                m.vote_average,
                m.release_date
            FROM movies.movie m
                     INNER JOIN movies.movie_crew mc ON m.movie_id = mc.movie_id
                     INNER JOIN movies.person p ON p.person_id = mc.person_id
            WHERE mc.job = 'Director' AND mc.person_id = $1
            ORDER BY m.release_date DESC;
        `, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).send('Director no encontrado o sin películas.');
        }

        const directorName = result.rows[0].person_name;

        res.render('director', {
            directorName: directorName,
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


// ==========================================================
// 🔎 RUTAS PARA BÚSQUEDA DE PERFILES
// ==========================================================

// GET: Muestra la página de búsqueda de perfiles
app.get('/search_profile', (req, res) => {
    // La variable `query` se usa para precargar el input si el usuario regresa
    const searchTerm = req.query.q || '';
    res.render('search_profile', {
        query: searchTerm,
        userId: req.session.userId, // Necesario para el header/sidebar
        // Asumiendo que tu EJS de búsqueda se llama 'search_profile.ejs'
    });
});

// GET: Ejecuta la búsqueda de perfiles
app.get('/buscarperfiles', async (req, res) => {
    const queryTerm = req.query.q;

    if (!queryTerm) {
        // Si no hay término de búsqueda, redirige a la página de búsqueda
        return res.redirect('/search_profile');
    }

    // Usamos ILIKE para hacer la búsqueda insensible a mayúsculas y minúsculas
    const searchTerm = `%${queryTerm.toLowerCase()}%`;

    try {
        const users = await db.query(`
            SELECT user_id, user_username, user_name, user_email
            FROM public."user"
            WHERE LOWER(user_username) LIKE $1 OR LOWER(user_email) LIKE $1
            ORDER BY user_username;
        `, [searchTerm]);

        // Renderiza una nueva vista de resultados de búsqueda (Necesitas crear `resultados_perfiles.ejs`)
        res.render('resultados_perfiles', {
            users: users.rows,
            query: queryTerm,
            userId: req.session.userId
        });

    } catch (error) {
        console.error('Error al buscar perfiles:', error);
        res.status(500).send('Error interno del servidor al buscar perfiles.');
    }
});
app.get('/perfil/:id', async (req, res) => {
    const profileId = req.params.id;

    try {
        // 1. Obtener datos del usuario
        const userResult = await db.query(`
            SELECT user_id, user_username, user_name, user_email
            FROM public."user"
            WHERE user_id = $1;
        `, [profileId]);

        if (userResult.rows.length === 0) return res.status(404).send('Usuario no encontrado.');
        const user = userResult.rows[0];

        // 2. Obtener interacciones (Ratings, Opiniones, Favoritos)
        // Se asume que la tabla movies.movie_user tiene los IDs de movie, rating, opinion y favorite.
        const interactionsResult = await db.query(`
            SELECT 
                mu.rating, 
                mu.opinion, 
                mu.favorite, 
                m.movie_id, 
                m.title, 
                m.poster_url
            FROM movies.movie_user mu
            JOIN movies.movie m ON mu.movie_id = m.movie_id
            WHERE mu.user_id = $1;
        `, [profileId]);

        // 3. Clasificar interacciones
        const allInteractions = interactionsResult.rows;

        const ratings = allInteractions.filter(item => item.rating !== null);
        const reviews = allInteractions.filter(item => item.opinion && item.opinion.trim() !== '');
        const favorites = allInteractions.filter(item => item.favorite === true);

        // 4. Renderizar la vista
        res.render('perfil', {
            user: user,
            ratings: ratings,
            reviews: reviews,
            favorites: favorites,
            userId: req.session.userId, // ID del usuario logueado actualmente (para el header)
            isOwner: req.session.userId == profileId // Booleano para saber si es el perfil propio
        });

    } catch (err) {
        console.error('Error al cargar el perfil:', err);
        res.status(500).send('Error interno del servidor.');
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