import requests
import psycopg2

conn = psycopg2.connect(
    host="localhost",
    database="movies",
    user="postgres",
    password="Sandos2005$"
)
cur = conn.cursor()

cur.execute("SELECT movie_id, title FROM movies.movie")
movies = cur.fetchall()

def buscar_pelicula(title):
    url = "https://api.themoviedb.org/3/search/movie"
    params = {
        "api_key": "383df228c1bef4975085bc47cd327a3d",
        "query": title,
        "language": "es-ES"
    }
    response = requests.get(url, params=params)
    data = response.json()
    
    if data["results"]:
        poster_path = data["results"][0]["poster_path"]
        return f"https://image.tmdb.org/t/p/w500{poster_path}"
    else:
        return None

for movie_id, title in movies:
    poster_url = buscar_pelicula(title)
    if poster_url:
        cur.execute(
            "UPDATE movies.movie SET poster_url = %s WHERE movie_id = %s",
            (poster_url, movie_id)
        )
        print(f"{title} → {poster_url}")

conn.commit()
cur.close()
conn.close()
