// Build de Etherial Labs para Cloudflare Pages (sin dependencias).
//
// Cloudflare Pages → Settings → Builds:
//   Build command:          node scripts/build.mjs
//   Build output directory: dist
//
// Qué hace:
//   1. Valida labs.json (formato, slugs únicos, carpeta existente, fecha ISO).
//      Si algo está mal, el deploy falla y producción no cambia.
//   2. Copia a dist/ solo los labs "publicado" y "archivado". Los "borrador" no
//      llegan a producción; en los previews de otras ramas sí (ver
//      incluirBorradores y docs/LABS.md).
//   3. Escribe dist/labs.json solo con esos labs. Los borradores no aparecen
//      en el JSON público.
//   4. A los archivados les inyecta un aviso visible arriba de la página.
//
// Uso local: node scripts/build.mjs [--incluir-borradores]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ESTADOS = ['borrador', 'publicado', 'archivado'];
export const PATRON_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ARCHIVOS_RAIZ = ['index.html', '_headers', 'favicon.svg'];

/** Lista de errores de labs.json (vacía si es válido). */
export function validar(manifiesto, raiz = RAIZ) {
  const errores = [];
  if (!manifiesto || manifiesto.version !== 1 || !Array.isArray(manifiesto.labs)) {
    return ['labs.json debe ser { "version": 1, "labs": [ … ] }'];
  }
  const vistos = new Set();
  manifiesto.labs.forEach((lab, i) => {
    const donde = `labs[${i}]${lab && lab.slug ? ` (${lab.slug})` : ''}`;
    if (!lab || typeof lab !== 'object') {
      errores.push(`${donde}: debe ser un objeto`);
      return;
    }
    if (typeof lab.slug !== 'string' || !PATRON_SLUG.test(lab.slug) || lab.slug.startsWith('_')) {
      errores.push(`${donde}: slug inválido (minúsculas, números y guiones; ej. "sensor-luz")`);
    } else if (vistos.has(lab.slug)) {
      errores.push(`${donde}: slug repetido`);
    } else {
      vistos.add(lab.slug);
      if (!existsSync(path.join(raiz, 'labs', lab.slug, 'index.html'))) {
        errores.push(`${donde}: falta labs/${lab.slug}/index.html`);
      }
    }
    for (const campo of ['nombre', 'descripcion']) {
      if (typeof lab[campo] !== 'string' || !lab[campo].trim() || lab[campo].length > 300) {
        errores.push(`${donde}: "${campo}" es obligatorio (máx. 300 caracteres)`);
      }
    }
    if (typeof lab.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(lab.fecha) || Number.isNaN(Date.parse(lab.fecha))) {
      errores.push(`${donde}: "fecha" debe ser AAAA-MM-DD`);
    }
    if (!ESTADOS.includes(lab.estado)) {
      errores.push(`${donde}: "estado" debe ser ${ESTADOS.join(', ')}`);
    }
    if (lab.dispositivo !== undefined && typeof lab.dispositivo !== 'boolean') {
      errores.push(`${donde}: "dispositivo" debe ser true o false`);
    }
  });
  return errores;
}

const AVISO_ARCHIVADO = `<div role="note" style="position:sticky;top:0;z-index:2147483647;padding:10px 16px;background:#fef3c7;color:#7a5900;font:14px/1.4 system-ui,sans-serif;text-align:center">Este experimento está archivado: puede no funcionar.</div>`;

/** Construye dist/. Devuelve la lista de labs publicados en el JSON público. */
export function construir({ raiz = RAIZ, salida = path.join(raiz, 'dist'), incluirBorradores = false } = {}) {
  const manifiesto = JSON.parse(readFileSync(path.join(raiz, 'labs.json'), 'utf8'));
  const errores = validar(manifiesto, raiz);
  if (errores.length) {
    const err = new Error(`labs.json no es válido:\n- ${errores.join('\n- ')}`);
    err.errores = errores;
    throw err;
  }
  rmSync(salida, { recursive: true, force: true });
  mkdirSync(path.join(salida, 'labs'), { recursive: true });
  for (const archivo of ARCHIVOS_RAIZ) {
    if (existsSync(path.join(raiz, archivo))) cpSync(path.join(raiz, archivo), path.join(salida, archivo));
  }
  const visibles = manifiesto.labs.filter(
    (lab) => lab.estado !== 'borrador' || incluirBorradores,
  );
  for (const lab of visibles) {
    const destino = path.join(salida, 'labs', lab.slug);
    cpSync(path.join(raiz, 'labs', lab.slug), destino, { recursive: true });
    if (lab.estado === 'archivado') {
      const index = path.join(destino, 'index.html');
      const html = readFileSync(index, 'utf8');
      writeFileSync(index, html.replace(/<body([^>]*)>/i, `<body$1>${AVISO_ARCHIVADO}`));
    }
  }
  const publico = { version: 1, labs: visibles.map(({ slug, nombre, descripcion, fecha, estado, dispositivo }) => ({ slug, nombre, descripcion, fecha, estado, dispositivo: Boolean(dispositivo) })) };
  writeFileSync(path.join(salida, 'labs.json'), `${JSON.stringify(publico, null, 2)}\n`);
  return publico.labs;
}

/**
 * ¿Se incluyen los borradores? En Cloudflare Pages, CF_PAGES_BRANCH es la rama
 * que se despliega: en `main` (producción) nunca; en cualquier otra rama
 * (preview, protegido con Access) sí. En local, con --incluir-borradores.
 */
export function incluirBorradores(argv = process.argv, env = process.env) {
  if (argv.includes('--incluir-borradores')) return true;
  const rama = env.CF_PAGES_BRANCH;
  return Boolean(rama) && rama !== 'main';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const labs = construir({ incluirBorradores: incluirBorradores() });
    console.log(`dist/ listo: ${labs.length} lab(s): ${labs.map((l) => `${l.slug} (${l.estado})`).join(', ') || 'ninguno'}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
