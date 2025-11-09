require('dotenv').config();

const express = require('express');
const connectMongo = require('./mongodb/connectMongo');
const userActivityRoutes = require('./mongodb/userActivity.route');
const { Pool } = require('pg');
// Dependencias para Autenticación
const bcrypt = require('bcrypt');
const session = require('express-session');

// contruccion de la pagina con express
const app = express();
const port = process.env.PORT || 3500;

connectMongo();

// Serve static files from the "views" directory
app.use(express.static('views'));
app.use(express.static('public'));
app.use(express.json());

// ⚠️ CORRECCIÓN CLAVE: Añadir middleware para parsear formularios tradicionales
app.use(express.urlencoded({ extended: true }));

// Configurar middleware de sesión
app.use(session({
    secret: process.env.SESSION_SECRET || 'mi-clave-secreta-muy-segura-reemplazar',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

app.use('/activity', userActivityRoutes);

// Conexión a PostgreSQL
const db = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Motor de plantillas
app.set('view engine', 'ejs');

const isAuthenticated = (req, res, next) => {
    if (req.session.userId) next();
    else res.redirect('/login');
};

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
        res.redirect('/');

    } catch (err) {
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

    // 🔍 DEBUGGING: Muestra los datos recibidos
    console.log('--- INTENTO DE LOGIN ---');
    console.log('Identificador recibido:', identifier);
    console.log('Contraseña recibida (sin hash):', user_password);

    try {
        const result = await db.query(`
            SELECT user_id, user_password_hash
            FROM public."user"
            WHERE user_username = $1 OR user_email = $1;
        `, [identifier]);

        const user = result.rows[0];

        // 🔍 DEBUGGING: Muestra si el usuario fue encontrado y su hash
        if (user) {
            console.log('Usuario encontrado. ID:', user.user_id);
            console.log('Hash de contraseña en DB:', user.user_password_hash);
        } else {
            console.log('Usuario NO encontrado en la DB.');
            req.session.error = 'Credenciales inválidas.';
            return res.redirect('/login');
        }

        // Si el usuario existe, comparamos la contraseña
        const isMatch = await bcrypt.compare(user_password, user.user_password_hash);

        // 🔍 DEBUGGING: Muestra el resultado de la comparación
        console.log('Resultado de bcrypt.compare:', isMatch);

        if (isMatch) {
            req.session.userId = user.user_id;
            console.log('Login exitoso.');
            return res.redirect('/');
        }

        req.session.error = 'Credenciales inválidas.';
        res.redirect('/login');

    } catch (err) {
        console.error('Error en la ruta /login:', err); // Mostrar el error completo
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
        console.error(err);
        res.render('index', { trendingMovies: [], topRatedMovies: [], userId: req.session.userId });
    }
});

// BUSCAR
app.get('/buscar', async (req, res) => {
    const searchTerm = `%${req.query.q}%`;

    try {
        const movies = await db.query(`
            SELECT * FROM movies.movie WHERE title ILIKE $1;
        `, [searchTerm]);

        const actors = await db.query(`
            SELECT DISTINCT p.person_name, p.person_id
            FROM movies.person p
                     JOIN movies.movie_cast mc ON mc.person_id = p.person_id
            WHERE p.person_name ILIKE $1;
        `, [searchTerm]);

        const directors = await db.query(`
            SELECT DISTINCT p.person_name, p.person_id
            FROM movies.movie_crew mc
                     JOIN movies.person p ON mc.person_id = p.person_id
            WHERE mc.job = 'Director' AND p.person_name ILIKE $1;
        `, [searchTerm]);

        const keys = await db.query(`
            WITH keyword_in_movie AS (
                SELECT DISTINCT m.*, k.keyword_name
                FROM movies.movie m
                         LEFT JOIN movies.movie_keywords mk ON m.movie_id = mk.movie_id
                         LEFT JOIN movies.keyword k ON mk.keyword_id = k.keyword_id
            )
            SELECT * FROM keyword_in_movie WHERE keyword_name ILIKE $1;
        `, [searchTerm]);

        const combined = [...movies.rows, ...keys.rows];
        const unique = Array.from(new Map(combined.map(m => [m.movie_id, m])).values());

        res.render('resultado', {
            movies: unique,
            keys: keys.rows,
            actors: actors.rows,
            directors: directors.rows,
            userId: req.session.userId
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Error en la búsqueda.');
    }
});

// DETALLE PELÍCULA
app.get('/pelicula/:id', async (req, res) => {
    const movieId = req.params.id;

    try {
        const result = await db.query(`
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

        if (result.rows.length === 0) return res.status(404).send('Película no encontrada.');

        const movieData = {
            title: result.rows[0].title,
            release_date: result.rows[0].release_date,
            overview: result.rows[0].overview,
            directors: [],
            writers: [],
            cast: [],
            crew: []
        };

        result.rows.forEach(row => {
            if (row.job === 'Director' && row.department_name === 'Directing') {
                movieData.directors.push({
                    crew_member_id: row.crew_member_id,
                    crew_member_name: row.crew_member_name
                });
            }

            if (row.actor_id) {
                movieData.cast.push({
                    actor_id: row.actor_id,
                    actor_name: row.actor_name,
                    character_name: row.character_name
                });
            }
        });

        res.render('pelicula', { movie: movieData, userId: req.session.userId });

    } catch (err) {
        console.error(err);
        res.status(500).send('Error.');
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
        res.render('actor', { actorName, movies: result.rows, userId: req.session.userId });

    } catch {
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
        res.render('director', { directorName, movies: result.rows, userId: req.session.userId });

    } catch {
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
        res.status(500).json({ error: err.message });
    }
});

// DELETE USUARIO
app.delete('/usuarios/:id', async (req, res) => {
    try {
        const result = await db.query(`
            DELETE FROM public."user"
            WHERE user_id = $1 RETURNING user_id, user_username, user_name, user_email;
        `, [req.params.id]);

        if (result.rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json({ mensaje: 'Usuario eliminado', usuario: result.rows[0] });

    } catch (err) {
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

        values.push(req.params.id);

        const result = await db.query(`
            UPDATE public."user"
            SET ${set.join(', ')}
            WHERE user_id = $${values.length}
                RETURNING user_id, user_username, user_name, user_email;
        `, values);

        if (result.rowCount === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json({ mensaje: 'Usuario actualizado', usuario: result.rows[0] });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => console.log(`✅ Servidor corriendo en http://localhost:${port}`));