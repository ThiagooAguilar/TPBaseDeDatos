-- ====================================================================
-- Master Script to Load the Movies Database
--
-- Executes all individual scripts in the correct order.
-- To run this script, use the psql command-line tool:
-- psql -d your_database_name -U your_username -f load_all.sql
--
-- For atomic execution (all or nothing), use the -1 or --single-transaction flag:
-- psql --single-transaction -d your_database_name -U your_username -f load_all.sql
-- ====================================================================

-- It tells psql to stop executing the script immediately if an error occurs.
\set ON_ERROR_STOP on

\echo '--- Starting database setup ---'

\echo '\n1. Loading reference data...'
\i 01_reference_data.sql

\echo '\n2. Loading keyword table...'
\i 02_keyword.sql

\echo '\n3. Loading person table...'
\i 03_person.sql

\echo '\n4. Loading production_company table...'
\i 04_production_company.sql

\echo '\n5. Loading movie table...'
\i 05_movie.sql

\echo '\n6. Loading movie_cast table...'
\i 06_movie_cast.sql

\echo '\n7. Loading movie_company table...'
\i 07_movie_company.sql

\echo '\n8. Loading movie_crew table...'
\i 08_movie_crew.sql

\echo '\n9. Loading movie_genres table...'
\i 09_movie_genres.sql

\echo '\n10. Loading movie_keywords table...'
\i 10_movie_keywords.sql

\echo '\n11. Loading movie_languages table...'
\i 11_movie_languages.sql

\echo '\n12. Loading production_country table...'
\i 12_production_country.sql

\echo '\n13. Loading user table...'
\i 13_user.sql

\echo '\n14. Loading movie_user table...'
\i 14_movie_user.sql

\echo '\n--- Database setup complete! ---'