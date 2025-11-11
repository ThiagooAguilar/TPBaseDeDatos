import requests
import psycopg2
import sys # Importar sys para salir si la clave es inválida

# --- 1. CONFIGURACIÓN DE LA BASE DE DATOS Y API ---
conn = None
cur = None

try:
    conn = psycopg2.connect(
        host="localhost",
        database="movies",
        user="postgres",
        password="Thiagoa1214+"
    )
    cur = conn.cursor()
except psycopg2.Error as e:
    print(f"❌ Error al conectar a la base de datos: {e}")
    sys.exit(1) # Salir si no se puede conectar

# Tu clave de API de TMDb
API_KEY = "5b39d07b3d99ccf9f3748f9b0d058f32" # He reemplazado la 'd' por 'f' para usar una clave que genere un error controlable, usa la tuya
API_KEY = "5b39d07b3d99ccf9d3748f9b0d058f32" # <--- ¡Asegúrate de que esta es tu clave correcta!
BASE_IMAGE_URL = "https://image.tmdb.org/t/p/"
IMAGE_SIZE = "w185" # Tamaño recomendado para miniaturas de perfil

# ----------------------------------------------------
# 2. OBTENER PERSONAS DE TU BASE DE DATOS
# ----------------------------------------------------
# Selecciona el ID de la persona y el nombre de la persona
cur.execute('''
    SELECT DISTINCT
        p.person_id,
        p.person_name
    FROM
        movies.person p
    INNER JOIN
        movies.movie_cast mc ON p.person_id = mc.person_id
    WHERE
        p.profile_url IS NULL
        AND mc.character_name IS NOT NULL -- <--- 🔑 FILTRO CLAVE: Asume que un personaje implica un actor.
''')
people_to_update = cur.fetchall()

def buscar_y_obtener_url(name, person_id):
    """
    Busca una persona en TMDb por su nombre y devuelve la URL de su perfil.
    Ahora incluye manejo de errores de API.
    """
    search_url = "https://api.themoviedb.org/3/search/person"
    params_search = {
        "api_key": API_KEY,
        "query": name,
        "language": "es-ES"
    }

    try:
        response_search = requests.get(search_url, params=params_search, timeout=10)
        response_search.raise_for_status() # Lanza un error para códigos de estado 4xx/5xx

        data_search = response_search.json()

        # MANEJO DE ERROR CLAVE: Si 'results' no está, es un fallo de la API
        if "results" in data_search and data_search["results"]:
            # Tomamos el primer resultado
            profile_path = data_search["results"][0].get("profile_path")

            if profile_path:
                # Construimos la URL completa con el tamaño deseado
                return f"{BASE_IMAGE_URL}{IMAGE_SIZE}{profile_path}"

        # Manejo de error específico de TMDb (ej. clave inválida o tasa límite)
        elif "status_message" in data_search:
            print(f"⚠️ Error de API para {name}: {data_search['status_message']}")
            # Devolver None y continuar, pero reportar el problema
            return None

    except requests.exceptions.HTTPError as err:
        print(f"❌ Error HTTP al buscar {name}: {err}")
    except requests.exceptions.RequestException as err:
        print(f"❌ Error de conexión al buscar {name}: {err}")
    except Exception as e:
        print(f"❌ Error inesperado en TMDb para {name}: {e}")

    return None

# ----------------------------------------------------
# 3. PROCESAR Y ACTUALIZAR CADA PERSONA
# ----------------------------------------------------
print(f"Buscando imágenes para {len(people_to_update)} personas...")

for person_id, name in people_to_update:
    # 1. Buscar la URL en TMDb
    profile_url = buscar_y_obtener_url(name, person_id)

    if profile_url:
        # 2. Actualizar la base de datos con la URL
        try:
            cur.execute(
                "UPDATE movies.person SET profile_url = %s WHERE person_id = %s",
                (profile_url, person_id)
            )
            # NO CONFIRMAMOS AQUÍ, SOLO AL FINAL
            print(f"✅ {name} (ID: {person_id}) marcado para actualizar.")
        except psycopg2.Error as e:
            # Si hay un error de SQL, deshacemos solo esta operación
            conn.rollback()
            print(f"⚠️ Error fatal al actualizar DB para {name} (ROLLBACK): {e}")
            # Podemos optar por detener el proceso aquí para investigar:
            # sys.exit(1)
    else:
        print(f"❌ {name} (ID: {person_id}) - No se encontró URL de perfil o hubo un fallo de API.")

# --- 4. CIERRE DE CONEXIÓN ---

# Este es el punto crucial: si el script llegó hasta aquí sin interrupción,
# CONFIRMAMOS TODOS LOS CAMBIOS DE LA BASE DE DATOS.
if conn:
    conn.commit()
    cur.close()
    conn.close()
    print("\nProceso finalizado. Se guardaron los cambios en la base de datos.")