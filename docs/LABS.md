# Cómo crear y publicar un lab

Los labs son páginas HTML experimentales (demos, prototipos, páginas que se
conectan a un dispositivo o servicio). Se publican en
`https://labs.etherialart.com/labs/<slug>/` haciendo **push a este repo**. No
hay endpoint de subida de archivos.

## Crear uno nuevo

1. Copia la plantilla:

   ```bash
   cp -r labs/_template labs/mi-experimento
   ```

2. Edita `labs/mi-experimento/index.html` (lo marcado con «EDITA»).
3. Añade la entrada al final de `labs.json`:

   ```json
   {
     "slug": "mi-experimento",
     "nombre": "Mi experimento",
     "descripcion": "Qué hace, en una línea.",
     "fecha": "2026-11-05",
     "estado": "borrador",
     "dispositivo": false
   }
   ```

   - `slug`: el nombre de la carpeta (minúsculas, números y guiones).
   - `estado`: `borrador` (no se publica), `publicado` o `archivado` (sigue
     accesible, con un aviso de "archivado").
   - `dispositivo`: `true` si usa USB, Bluetooth, serie, cámara o micrófono.

4. Prueba en local:

   ```bash
   node scripts/build.mjs --incluir-borradores
   ```

   ```bash
   npx serve dist
   ```

   Sin `--incluir-borradores` verás lo mismo que producción.

## Publicar

1. Sube una rama (`git push origin borrador/mi-experimento`). Cloudflare Pages
   crea un **preview** en `<rama>.etherial-labs.pages.dev`. En cualquier rama
   que no sea `main` el build **incluye los borradores**, así que ahí lo ves tal
   cual. Protege los previews con Access (abajo).
2. Cuando esté listo, cambia `"estado": "publicado"` y mergea a `main`.
   Cloudflare publica en `labs.etherialart.com`.
3. Para retirarlo, `"estado": "archivado"` (sigue accesible con aviso) o borra
   la entrada y la carpeta.

Si `labs.json` está mal (slug repetido, carpeta inexistente, fecha inválida),
**el deploy falla** y producción no cambia. El error dice qué corregir.

## En el panel admin

La pestaña **Labs** del panel lista todos los labs de `labs.json` en `main`,
también los borradores, con su estado. Tiene una vista previa en un `iframe` con
`sandbox` y un botón para abrirlo en otra pestaña. Para ver los borradores, el
backend necesita un token de GitHub de solo lectura (ver abajo).

## Reglas de aislamiento (no las rompas)

- **Nada de secretos** en un lab: tokens, claves de API, la clave de Supabase,
  `ADMIN_SECRET`. Todo lo que está en este repo se publica.
- **No llames a la API de Etherial Art ni a Supabase.** El backend no acepta
  peticiones desde `labs.etherialart.com` (CORS) a propósito.
- **No crees cookies con `Domain=etherialart.com`.** El subdominio es otro
  origen, pero el mismo "sitio": una cookie del dominio padre llegaría al sitio
  y al panel.
- **Muestra con `textContent`**, nunca con `innerHTML`, todo lo que venga del
  usuario o de un dispositivo.
- **Dispositivos:** en la vista previa del panel los permisos de hardware están
  bloqueados (iframe con `sandbox`). Para usar el dispositivo, abre el lab en su
  propia pestaña.

## Configuración (una sola vez)

- **Cloudflare Pages → etherial-labs → Settings → Builds:**
  - Build command: `node scripts/build.mjs`
  - Build output directory: `dist`
- **Cloudflare Pages → Settings → General → Access policy:** actívala para los
  *preview deployments*, así solo tú ves los borradores.
- **Railway (backend) → variable `GITHUB_LABS_TOKEN`:** un *fine-grained
  personal access token* de GitHub con acceso **solo** a
  `Etherial-art/etherial-labs` y permiso **Contents: Read-only**. Sin él, el
  panel lista solo los labs publicados (lee el `labs.json` público).
