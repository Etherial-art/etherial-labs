// Pruebas del build de Etherial Labs (node --test, sin dependencias).
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { construir, incluirBorradores, validar } from '../scripts/build.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function repoDePrueba(labs) {
  const dir = mkdtempSync(path.join(tmpdir(), 'labs-'));
  cpSync(path.join(RAIZ, 'index.html'), path.join(dir, 'index.html'));
  cpSync(path.join(RAIZ, '_headers'), path.join(dir, '_headers'));
  for (const lab of labs) {
    if (!lab.sinCarpeta) {
      mkdirSync(path.join(dir, 'labs', lab.slug), { recursive: true });
      writeFileSync(path.join(dir, 'labs', lab.slug, 'index.html'), `<html><body><p>${lab.slug}</p></body></html>`);
    }
  }
  const limpio = labs.map(({ sinCarpeta, ...l }) => l);
  writeFileSync(path.join(dir, 'labs.json'), JSON.stringify({ version: 1, labs: limpio }));
  return dir;
}

const lab = (slug, estado, extra = {}) => ({
  slug,
  nombre: `Lab ${slug}`,
  descripcion: 'Descripción',
  fecha: '2026-11-05',
  estado,
  ...extra,
});

describe('labs.json del repo', () => {
  it('es válido y construye', () => {
    const manifiesto = JSON.parse(readFileSync(path.join(RAIZ, 'labs.json'), 'utf8'));
    assert.deepEqual(validar(manifiesto), []);
  });
});

describe('validar', () => {
  it('detecta cada error con un mensaje claro', () => {
    const dir = repoDePrueba([lab('ok', 'publicado')]);
    const errores = validar(
      {
        version: 1,
        labs: [
          lab('ok', 'publicado'),
          lab('ok', 'publicado'),
          lab('Mal Slug', 'publicado'),
          lab('_template', 'publicado'),
          lab('no-existe', 'publicado'),
          lab('ok2', 'listo'),
          { ...lab('ok3', 'borrador'), fecha: '05/11/2026', nombre: '' },
        ],
      },
      dir,
    );
    const texto = errores.join('\n');
    assert.match(texto, /slug repetido/);
    assert.match(texto, /\(Mal Slug\): slug inválido/);
    assert.match(texto, /\(_template\): slug inválido/);
    assert.match(texto, /falta labs\/no-existe\/index\.html/);
    assert.match(texto, /"estado" debe ser/);
    assert.match(texto, /"fecha" debe ser AAAA-MM-DD/);
    assert.match(texto, /"nombre" es obligatorio/);
  });

  it('rechaza un archivo sin el formato esperado', () => {
    assert.equal(validar({ labs: [] }).length, 1);
    assert.equal(validar(null).length, 1);
  });
});

describe('construir', () => {
  it('los borradores no llegan a producción ni al JSON público', () => {
    const dir = repoDePrueba([lab('pub', 'publicado'), lab('borr', 'borrador'), lab('arch', 'archivado')]);
    const salida = path.join(dir, 'dist');
    const labs = construir({ raiz: dir, salida });
    assert.deepEqual(labs.map((l) => l.slug), ['pub', 'arch']);
    assert.ok(existsSync(path.join(salida, 'labs', 'pub', 'index.html')));
    assert.ok(!existsSync(path.join(salida, 'labs', 'borr')));
    const publico = JSON.parse(readFileSync(path.join(salida, 'labs.json'), 'utf8'));
    assert.ok(!JSON.stringify(publico).includes('borr'));
    assert.ok(existsSync(path.join(salida, '_headers')));
    assert.ok(existsSync(path.join(salida, 'index.html')));
  });

  it('los archivados llevan un aviso visible', () => {
    const dir = repoDePrueba([lab('arch', 'archivado')]);
    const salida = path.join(dir, 'dist');
    construir({ raiz: dir, salida });
    const html = readFileSync(path.join(salida, 'labs', 'arch', 'index.html'), 'utf8');
    assert.match(html, /<body><div role="note"[^>]*>Este experimento está archivado/);
  });

  it('con --incluir-borradores (local) sí los copia', () => {
    const dir = repoDePrueba([lab('borr', 'borrador')]);
    const labs = construir({ raiz: dir, salida: path.join(dir, 'dist'), incluirBorradores: true });
    assert.deepEqual(labs.map((l) => l.slug), ['borr']);
  });

  it('si labs.json es inválido, falla y no toca dist/', () => {
    const dir = repoDePrueba([lab('falta', 'publicado', { sinCarpeta: true })]);
    const salida = path.join(dir, 'dist');
    mkdirSync(salida);
    writeFileSync(path.join(salida, 'anterior.txt'), 'x');
    assert.throws(() => construir({ raiz: dir, salida }), /falta labs\/falta\/index\.html/);
    assert.ok(existsSync(path.join(salida, 'anterior.txt')));
  });

  it('la plantilla nunca se publica', () => {
    const dir = repoDePrueba([lab('pub', 'publicado')]);
    mkdirSync(path.join(dir, 'labs', '_template'), { recursive: true });
    writeFileSync(path.join(dir, 'labs', '_template', 'index.html'), 'x');
    construir({ raiz: dir, salida: path.join(dir, 'dist') });
    assert.ok(!existsSync(path.join(dir, 'dist', 'labs', '_template')));
  });
});

describe('_headers', () => {
  it('solo el panel puede enmarcar los labs y no se indexan', () => {
    const headers = readFileSync(path.join(RAIZ, '_headers'), 'utf8');
    assert.match(headers, /Content-Security-Policy: frame-ancestors https:\/\/etherialart\.com\n/);
    assert.match(headers, /X-Robots-Tag: noindex/);
  });
});

describe('incluirBorradores', () => {
  it('nunca en main; sí en otras ramas y con la bandera local', () => {
    assert.equal(incluirBorradores([], { CF_PAGES_BRANCH: 'main' }), false);
    assert.equal(incluirBorradores([], {}), false);
    assert.equal(incluirBorradores([], { CF_PAGES_BRANCH: 'borrador/x' }), true);
    assert.equal(incluirBorradores(['--incluir-borradores'], {}), true);
  });
});
