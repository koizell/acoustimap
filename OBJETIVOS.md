# Objetivos del Proyecto - AcoustiMap

Este documento detalla los objetivos estratégicos para el despliegue y la persistencia de datos de la aplicación **AcoustiMap**.

---

## 1. Despliegue en GitHub Pages

El objetivo es publicar la aplicación web estática en la web de forma gratuita y accesible públicamente mediante GitHub Pages.

### Tareas y Pasos:

* **Preparación del Repositorio:**
  * Inicializar un repositorio Git local en la carpeta del proyecto.
  * Crear un repositorio remoto en GitHub (ej. `acoustimap`).
  * Subir el código fuente (`index.html`, `styles.css`, `script.js` y recursos estáticos).
* **Configuración de GitHub Pages:**
  * Dirigirse a la pestaña **Settings** (Configuración) del repositorio en GitHub.
  * En la sección **Code and automation**, seleccionar **Pages**.
  * En **Build and deployment**, configurar la fuente (*Source*) como la rama principal (`main` o `master`) y la carpeta raíz (`/root`).
  * Guardar los cambios y verificar que la URL generada despliegue correctamente la aplicación en vivo.

---

## 2. Integración de Base de Datos Supabase

El objetivo es conectar la aplicación a una base de datos relacional en la nube (Supabase / PostgreSQL) para almacenar las mediciones de ruido geolocalizadas registradas por los usuarios.

### Tareas y Pasos:

* **Configuración en Supabase:**
  * Crear un nuevo proyecto en la plataforma [Supabase](https://supabase.com).
  * Obtener las credenciales de conexión: `SUPABASE_URL` y la clave pública `SUPABASE_ANON_KEY`.
* **Diseño del Esquema de Base de Datos (SQL):**
  * Crear una tabla llamada `noise_measurements` con la siguiente estructura básica:
    ```sql
    create table noise_measurements (
      id uuid default gen_random_uuid() primary key,
      latitude double precision not null,
      longitude double precision not null,
      db_level integer not null,
      category text not null,
      created_at timestamp with time zone default timezone('utc'::text, now()) not null
    );
    ```
  * Habilitar Row Level Security (RLS) y configurar políticas de inserción pública si es necesario.
* **Integración en el Cliente (`script.js`):**
  * Incluir el cliente de Supabase vía CDN en `index.html`:
    ```html
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    ```
  * Inicializar el cliente en `script.js` con las credenciales del proyecto.
  * Implementar una función para enviar los registros de ruido a Supabase cada vez que se realice una medición significativa o se guarde un punto en el mapa.
