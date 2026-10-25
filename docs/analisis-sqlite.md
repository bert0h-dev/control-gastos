# Análisis: ¿guardar los datos en SQLite en lugar del navegador?

**Respuesta corta:** sí es factible, y la arquitectura actual lo facilita. Pero "usar SQLite" puede significar tres cosas muy distintas, y solo una de ellas resuelve los problemas reales del proyecto. La recomendación es la **opción B: un servidor local con Node y SQLite**, hecha en fases.

---

## 1. Cómo se guarda hoy

- Todo el estado (`state`) se guarda como **un solo JSON** en `localStorage`, con la clave `controlGastos.v1`.
- Solo dos funciones tocan el almacenamiento: `load()` y `save()` en `src/js/core.js`.
- Cada cambio reescribe el JSON completo.
- Todos los cálculos se hacen en memoria con JavaScript (`src/js/logic/`).

### Problemas reales de este enfoque

| Problema | Qué tan grave es |
|---|---|
| **Pérdida de datos.** Si borras los datos del navegador, usas otro navegador o reinstalas Windows, se pierde todo. El único resguardo es descargar el respaldo a mano | **Alto.** Es el riesgo principal |
| **Un solo dispositivo.** Lo que registras en la PC no aparece en el celular | Alto si la quieres usar en el día a día |
| **Atado a la dirección.** `localhost:5173` y la versión publicada tienen almacenamientos distintos (ya nos pasó al migrar a Vite) | Medio |
| **Límite de tamaño.** `localStorage` permite unos 5 MB por sitio. Un movimiento ocupa unos 200 bytes, así que 100 movimientos al mes durante 10 años son unos 2.4 MB | Bajo hoy, medio a largo plazo |
| **Rendimiento.** Filtrar miles de movimientos en memoria sigue siendo instantáneo | **No es un problema** |

**Conclusión:** el problema no es la falta de una base de datos con SQL, sino **dónde viven los datos**. Cualquier opción que los deje dentro del navegador no resuelve lo importante.

---

## 2. Las tres formas de "usar SQLite"

### Opción A: SQLite dentro del navegador (WebAssembly)

Se carga SQLite compilado a WebAssembly (`@sqlite.org/sqlite-wasm` o `sql.js`) y la base se guarda en el almacenamiento privado del navegador (OPFS).

| A favor | En contra |
|---|---|
| No necesita servidor | **Los datos siguen en el navegador:** no resuelve la pérdida ni el uso en varios dispositivos |
| Permite consultas SQL | Suma unos 900 KB de WebAssembly a una app que hoy pesa 17 KB comprimida |
| Quita el límite de 5 MB | La persistencia en OPFS necesita un Worker. El modo más rápido además exige cabeceras especiales del servidor (COOP/COEP), que complican publicar la app |
| | Hay que reescribir la capa de datos para ganar algo que hoy no hace falta |

**Veredicto: no conviene.** Es mucho trabajo para resolver solo el problema menos grave.

### Opción B: servidor local con Node y SQLite ✅ recomendada

Un pequeño servidor en Node guarda los datos en un archivo `gastos.db` en tu disco y expone una API. La página deja de usar `localStorage` y le pide los datos al servidor.

```
 Navegador (PC o celular en tu red)          Tu PC
 ┌────────────────────────────┐   HTTP   ┌──────────────────────────┐
 │ página actual (Vite)       │ ───────► │ servidor Node            │
 │ load() / save() → fetch()  │ ◄─────── │ node:sqlite → gastos.db  │
 └────────────────────────────┘   JSON   └──────────────────────────┘
```

| A favor | En contra |
|---|---|
| **Los datos viven en un archivo** que no se borra al limpiar el navegador. Respaldarlo es copiar un archivo, o sincronizar la carpeta con OneDrive o Google Drive | El servidor tiene que estar encendido para usar la app |
| Funciona en cualquier navegador de la PC, y **desde el celular** si está en la misma red Wi-Fi | Fuera de tu casa no funciona, a menos que lo publiques (opción C) |
| **No requiere librerías nuevas.** Node 24 trae SQLite integrado (`node:sqlite`). Ya lo probé en tu equipo: Node v24.22.1 con SQLite 3.53.4 funciona | Sin el servidor la app no abre, salvo que se agregue un modo sin conexión |
| Se puede abrir y consultar `gastos.db` con herramientas como DB Browser for SQLite | Agrega una pieza más que mantener (el backend) |
| Base sólida para crecer después: cuentas de usuario, publicarla, varios usuarios | |

**Veredicto: es factible y es la que mejor encaja.** Resuelve la pérdida de datos y el uso desde varios dispositivos de tu casa con poco trabajo.

> `node:sqlite` todavía está marcado como experimental en Node 24 (su API podría cambiar en versiones futuras). Si se prefiere algo más estable, `better-sqlite3` es la alternativa probada; tiene binarios precompilados para Windows. El código del servidor sería casi idéntico con cualquiera de las dos.

### Opción C: SQLite en la nube (Turso / libSQL, o un servidor propio)

La misma idea que B, pero el servidor está en internet.

| A favor | En contra |
|---|---|
| Accesible desde cualquier lugar | **Hay que agregar inicio de sesión:** son datos financieros en internet |
| Varios dispositivos y varias personas | Requiere hosting, seguridad y respaldos del lado del servidor |

**Veredicto:** es el paso natural después de B, no antes. Si el objetivo final es tenerla en la nube con usuarios, conviene evaluar también **Supabase** (Postgres administrado, con inicio de sesión ya incluido), que ahorra mucho trabajo frente a montar todo a mano.

---

## 3. Qué tan preparado está el código

Buenas noticias: la arquitectura actual hace que la migración sea manejable.

| Aspecto | Estado | Por qué ayuda |
|---|---|---|
| Persistencia en un solo lugar | ✅ | Solo `load()` y `save()` en `core.js` tocan el almacenamiento. Es el único punto que hay que cambiar en la página |
| Lógica separada y probada | ✅ | `src/js/logic/` no sabe dónde viven los datos. Las 58 pruebas siguen siendo válidas |
| Validación de datos | ✅ | `sanitizeBackup()` ya valida un estado completo; se reutiliza en el servidor para validar lo que llega |
| Migración de datos viejos | ✅ | `migrate()` ya normaliza el estado; sirve para importar lo que hoy está en `localStorage` |
| Ids | ⚠️ | `newId()` usa la hora. Con un solo usuario funciona; con varios dispositivos escribiendo a la vez conviene que el servidor asigne los ids |
| `save()` es síncrono | ⚠️ | Hoy guarda al instante. Con un servidor se vuelve asíncrono y hay que manejar errores de red (aviso de "No se pudo guardar") |

---

## 4. Modelo de datos propuesto

```sql
CREATE TABLE accounts (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('efectivo','banco','ahorro','credito')),
  initial REAL NOT NULL DEFAULT 0, credit_limit REAL, cut_day INTEGER, pay_day INTEGER
);
CREATE TABLE categories (
  name TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('gasto','ingreso')), position INTEGER,
  PRIMARY KEY (name, type)
);
CREATE TABLE subcategories (category TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY (category, name));
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('gasto','ingreso','transferencia')),
  date TEXT NOT NULL,                       -- 'YYYY-MM-DD'
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  account_id TEXT REFERENCES accounts(id),
  to_account_id TEXT REFERENCES accounts(id),
  category TEXT, subcategory TEXT, note TEXT,
  recurring_id INTEGER REFERENCES recurring(id) ON DELETE SET NULL
);
CREATE INDEX tx_date ON transactions(date);
CREATE TABLE transaction_tags (tx_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE, tag TEXT, PRIMARY KEY (tx_id, tag));
CREATE TABLE recurring (
  id INTEGER PRIMARY KEY, type TEXT NOT NULL, description TEXT NOT NULL, amount_cents INTEGER NOT NULL,
  category TEXT, account_id TEXT REFERENCES accounts(id), day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 31),
  start TEXT NOT NULL, last_gen TEXT, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE budgets (category TEXT PRIMARY KEY, limit_cents INTEGER NOT NULL);
CREATE TABLE goals (id INTEGER PRIMARY KEY, name TEXT NOT NULL, target_cents INTEGER NOT NULL, saved_cents INTEGER NOT NULL DEFAULT 0, deadline TEXT NOT NULL);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);   -- tema, etc.
```

Decisiones clave:
- **Montos en centavos (`INTEGER`).** Elimina de raíz los errores de punto flotante. Hoy eso se resuelve en `logic/calculos.js` redondeando.
- **Fechas como texto `YYYY-MM-DD`,** igual que hoy. SQLite las ordena y compara bien como texto.
- **Etiquetas en su propia tabla,** para poder consultar "todo lo de #viaje" con SQL.

---

## 5. Plan de migración por fases

### Fase 1: servidor que guarda el estado completo (1 o 2 sesiones de trabajo)
- Crear `server/` con Node (`node:http` o Express) y `node:sqlite`.
- `GET /api/state` arma el estado desde las tablas; `PUT /api/state` lo valida con `sanitizeBackup()` y lo guarda **dentro de una transacción**.
- Configurar el proxy de Vite (`server.proxy`) para que `/api` llegue al servidor en desarrollo.
- En `core.js`: `load()` y `save()` pasan a usar `fetch` (asíncronos), con aviso si falla la red.
- **Importación inicial:** si el servidor está vacío y hay datos en `localStorage`, se suben automáticamente una sola vez.
- **El resto de la app no cambia.** Las vistas y la lógica siguen trabajando con `state` en memoria.

### Fase 2: API por entidad (opcional)
- Rutas como `POST /api/transactions` y `DELETE /api/transactions/:id`, para enviar solo lo que cambió en lugar del estado completo.
- Ids asignados por el servidor.
- Vale la pena si el volumen de datos crece mucho o si habrá varios dispositivos escribiendo a la vez.

### Fase 3: consultas en SQL (opcional)
- Mover al servidor los reportes pesados del análisis por rangos.
- Hoy no hace falta: los cálculos en memoria son instantáneos.

### Fase 4: publicarla (opción C)
- Inicio de sesión, HTTPS, hosting y respaldos automáticos del archivo `.db`.

---

## 6. Esfuerzo y riesgos

| Concepto | Estimación |
|---|---|
| Fase 1 completa (servidor, tablas, carga y guardado, importación desde `localStorage`, pruebas) | Moderado. Lo más laborioso es pasar `save()` a asíncrono y manejar errores |
| Cambios en vistas y lógica | Mínimos o ninguno |
| Dependencias nuevas | Ninguna con `node:sqlite`; una (`better-sqlite3`) si se prefiere la opción estable. Opcionalmente Express |

| Riesgo | Cómo mitigarlo |
|---|---|
| Perder datos en la migración | Respaldo JSON automático antes de importar, e importación idempotente (solo si el servidor está vacío) |
| `node:sqlite` cambia en otra versión de Node | Encapsular el acceso a la base en un solo módulo (`server/db.js`); cambiar a `better-sqlite3` sería tocar solo ese archivo |
| Guardar falla por red o servidor apagado | Aviso visible y reintento; opcionalmente una copia en `localStorage` como respaldo temporal |
| Uso simultáneo desde dos dispositivos | En la fase 1 gana el último en guardar. Con un solo usuario es aceptable; la fase 2 lo resuelve |

---

## 7. Recomendación

1. **No usar SQLite dentro del navegador (opción A):** no resuelve el problema de fondo.
2. **Sí migrar a un servidor local con Node y SQLite (opción B), empezando por la fase 1.** Es factible, no requiere dependencias nuevas, apenas toca las vistas y deja los datos en un archivo que no depende del navegador.
3. **Si el objetivo final es usarla desde cualquier lugar** con inicio de sesión, decidir antes de empezar entre seguir con SQLite en la nube (opción C) o pasar directamente a Supabase. Sería una lástima hacer la fase 1 para luego reemplazarla.
