# Arquitectura de `src/js`

Este documento explica cómo está organizado el JavaScript de Control de Gastos: qué hace cada archivo, en qué orden se carga, cómo fluyen los datos y qué reglas hay que respetar al modificarlo.

## Vista general

El código está dividido en dos capas:

```
src/js/
├── logic/              CAPA DE LÓGICA: funciones puras, sin DOM ni estado global
│   ├── fechas.js
│   ├── calculos.js
│   ├── cuentas.js
│   ├── analisis.js
│   ├── recurrentes.js
│   └── datos.js
│
├── main.js             punto de entrada
├── core.js             estado de la app y utilidades compartidas
├── ui.js               piezas de interfaz reutilizables
├── render.js           orquestador: redibuja toda la pantalla
│
├── resumen.js          ┐
├── movimientos.js      │
├── cuentas.js          │
├── analisis.js         │  CAPA DE VISTAS: una por pestaña o sección.
├── presupuestos.js     │  Leen el estado, piden cálculos a logic/
├── recurrentes.js      │  y pintan el HTML. También registran sus eventos.
├── metas.js            │
├── categorias.js       │
└── datos.js            ┘
```

| Capa | Puede usar | No puede usar |
|---|---|---|
| `logic/` | otros archivos de `logic/` | `document`, `window`, `localStorage`, `state`, `core.js` ni ninguna vista |
| Vistas | `core.js`, `ui.js`, `render.js`, `logic/` y otras vistas | lógica de negocio propia (cálculos de dinero, fechas, saldos): eso va en `logic/` |

**El deber ser:** si una función calcula algo, va en `logic/` y recibe todo lo que necesita como parámetro. Si una función toca la página, va en una vista y delega los cálculos. Así la lógica se puede probar con Vitest sin abrir un navegador (`npm test`).

---

## Flujo de datos

```
 localStorage ──load()──► state (core.js) ──► render() ──► cada vista ──► HTML
                              ▲                               │
                              │                               │ el usuario hace algo
                              └──── save() ◄── modifica state ◄┘
```

Toda acción del usuario sigue el mismo ciclo:

1. Una vista recibe el evento (submit de un formulario, clic en un botón).
2. Modifica `state` (agrega, cambia o elimina datos).
3. Llama a `save()` para guardar en `localStorage`.
4. Llama a `render()` para redibujar toda la pantalla.
5. Opcionalmente muestra un aviso con `toast()`.

```js
// Ejemplo real, en presupuestos.js
$('budgetForm').addEventListener('submit', e => {
  e.preventDefault();
  state.budgets[$('bCat').value] = round2(parseFloat($('bAmount').value));  // 2
  save(); render(); toast('Límite guardado');                               // 3, 4, 5
});
```

`render()` redibuja todo en lugar de solo la parte afectada. Es más simple y con este volumen de datos es instantáneo.

---

## Orden de carga

`index.html` carga un solo archivo: `<script type="module" src="/src/js/main.js">`. Desde ahí, cada archivo importa lo que necesita y el navegador resuelve el orden.

Como los módulos se importan entre sí en círculo (las vistas importan `render.js` y `render.js` importa las vistas), el orden de evaluación real es este:

1. **`logic/*`**: no dependen de nada externo. Se evalúan primero.
2. **`core.js`**: importa `logic/fechas.js` y `logic/cuentas.js`. Al evaluarse **carga el estado desde `localStorage`** y lo migra.
3. **`ui.js`**, **`render.js`** y **las vistas**: se evalúan en el orden en que se descubren los imports. Al evaluarse, cada vista **registra sus eventos** (`addEventListener`, `onclick`) y sus funciones `window.*`.
4. **`main.js`**: corre al final y arranca la app.

### Regla importante: código de nivel superior

Por las importaciones circulares, cuando una vista se evalúa puede que otra vista todavía no lo haya hecho. Por eso:

- **Sí se permite** en el nivel superior de una vista: registrar eventos y usar `$`, `state` u otras cosas de `core.js`. `core.js` siempre termina de evaluarse antes que cualquier vista.
- **Sí se permite** llamar a funciones declaradas con `function` de otros módulos, porque esas declaraciones existen desde antes de evaluar.
- **No se permite** en el nivel superior: usar una `const` o `let` importada de otra vista o de `ui.js`, por ejemplo `opts`. Puede no estar inicializada todavía y lanza `Cannot access 'x' before initialization`.
- **`core.js` no debe importar vistas ni `ui.js` de forma estática.** Si lo hace, se rompe el arranque. La única excepción es el `import()` dinámico dentro de `save()`, que se ejecuta mucho después.

---

## Capa de lógica (`logic/`)

Funciones puras: reciben datos y devuelven resultados. Nunca modifican el DOM ni leen el estado global. Las fechas viajan como texto: `'YYYY-MM'` (mes) y `'YYYY-MM-DD'` (día), siempre en hora local. Los montos son números con dos decimales y las sumas se hacen en centavos para evitar errores como `0.1 + 0.2 = 0.30000000000000004`.

### `logic/fechas.js`
Operaciones con fechas en texto. No depende de nada.

| Función | Qué hace |
|---|---|
| `today(now?)` | Fecha local de hoy como `'YYYY-MM-DD'` (no UTC) |
| `ym(date)`, `ymd(date)` | Convierte un `Date` a `'YYYY-MM'` o `'YYYY-MM-DD'` |
| `addMonths(m, n)` | Suma o resta meses (`'2026-12'` + 1 = `'2027-01'`) |
| `daysIn(m)` | Días del mes, incluido febrero bisiesto |
| `monthsUntil(from, to)` | Meses entre dos meses, ambos incluidos |
| `clampDay(m, day)` | Ajusta un día al mes (31 en febrero da 28 o 29) |
| `lastMonths(m, n)` | Los últimos `n` meses hasta `m`, en orden |

### `logic/calculos.js`
Cálculos generales sobre la lista de movimientos. Depende de `fechas.js`.

| Función | Qué hace |
|---|---|
| `round2`, `sum`, `sumOf`, `netOf` | Redondeo y sumas exactas en centavos. `sumOf` filtra por tipo y categoría; `netOf` da ingresos menos gastos |
| `inMonth(tx, m)` | Movimientos de un mes |
| `monthSummary(tx, m)` | Ingresos, gastos, balance y tasa de ahorro del mes |
| `expensesByCategory(tx, m)` | Gasto por categoría, ordenado, con porcentaje |
| `dailyAverage(tx, m, hoy)` | Gasto diario promedio y días restantes |
| `compareMonths(tx, m)` | Comparativo contra el mes anterior, con alertas de subidas del 20% o más |
| `budgetStatus(tx, budgets, m)` | Gastado, disponible y nivel (`ok`, `warn`, `over`) de cada presupuesto |
| `goalPlan(meta, mes)` | Progreso de una meta y cuánto ahorrar al mes |
| `filterTx(tx, filtros)` | Filtra por periodo (mes, rango o todo), categoría, tipo, cuenta y texto o `#etiqueta`. Ordena del más reciente al más antiguo |
| `groupByDay(lista)` | Agrupa por día con el neto de cada día |
| `chartSeries(tx, m, n)` | Ingresos y gastos de los últimos `n` meses para la gráfica |
| `niceScale(max)` | Escala legible para ejes (pasos de 1, 2, 2.5 o 5 × 10ⁿ) |

> Las transferencias (`type: 'transferencia'`) nunca cuentan como ingreso ni como gasto. `sumOf` las excluye porque filtra por tipo, y `netOf` les da valor 0.

### `logic/cuentas.js`
Cuentas, saldos y tarjetas de crédito. Depende de `fechas.js` y `calculos.js`.

| Función o constante | Qué hace |
|---|---|
| `KINDS` | Tipos de cuenta: `efectivo`, `banco`, `ahorro`, `credito` |
| `DEFAULT_ACCOUNTS` | Las tres cuentas que se crean la primera vez |
| `migrate(state)` | Completa datos de versiones anteriores: crea cuentas si no hay, asigna una cuenta a cada movimiento según su método de pago y crea `subcats`. Se ejecuta en cada carga |
| `effectOn(tx, cuentaId)` | Cuánto entra (+) o sale (−) de una cuenta con un movimiento |
| `balanceOf(cuenta, tx, hasta?)` | Saldo de una cuenta a una fecha. En crédito, negativo significa deuda |
| `cardStatement(tarjeta, tx, hoy)` | Estado de cuenta: último y próximo corte, fecha de pago, saldo al corte, pagos, cargos nuevos, monto por pagar y nivel (`ok`, `pending`, `soon`, `overdue`) |
| `netWorth(cuentas, tx)` | Patrimonio neto: suma de saldos, con las deudas restando |
| `daysBetween(a, b)` | Días entre dos fechas |

### `logic/analisis.js`
Proyecciones y análisis por periodo. Depende de `fechas.js` y `calculos.js`.

| Función | Qué hace |
|---|---|
| `projectMonth(tx, recurrentes, m, hoy)` | Proyección al cierre: el gasto variable extrapolado al ritmo actual, más los fijos cobrados, más los recurrentes que faltan. En meses que no son el actual devuelve lo real |
| `rangeSummary(tx, desde, hasta)` | Totales de un rango, promedio mensual y desglose por categoría, subcategoría y etiqueta |
| `balanceSeries(tx, mesDesde, mesHasta)` | Neto de cada mes y balance acumulado |
| `dailySpend(tx, m)` | Gasto por día, para el calendario |
| `parseTags(texto)` | `"#Viaje Cancún #cumple"` da `['viaje-cancún', 'cumple']` |
| `presetRange(preset, m)` | Rangos rápidos: `3m`, `6m`, `12m`, `year` |
| `inRange(tx, desde, hasta)` | Movimientos dentro de un rango |

### `logic/recurrentes.js`
Generación de movimientos recurrentes. Depende de `fechas.js`.

| Función | Qué hace |
|---|---|
| `generatePending(recurrentes, hoy, newId)` | Devuelve los movimientos que ya tocaban, desde el último mes generado hasta hoy, y actualiza `lastGen` de cada recurrente. Un día 31 se cobra el último día de los meses cortos |
| `resume(r, hoy)` | Reactiva un recurrente sin cobrar los meses que estuvo en pausa |
| `monthlyNet(recurrentes)` | Neto mensual de los recurrentes activos |

`newId` se recibe como parámetro para que las pruebas puedan controlar los ids.

### `logic/datos.js`
Importar y exportar. Depende de `calculos.js` y `cuentas.js`.

| Función | Qué hace |
|---|---|
| `toCsv(tx, nombreCuenta)` | Genera el CSV (con BOM para que Excel respete los acentos) |
| `parseCsv(texto, newId, idCuenta)` | Lee el CSV actual de 10 columnas y el formato anterior de 7. Descarta y cuenta las filas inválidas |
| `splitCsvLine(línea)` | Divide una línea respetando comillas y comas internas |
| `sanitizeBackup(json, defaults)` | Valida un respaldo JSON campo por campo. Descarta lo inválido, recorta textos largos y nunca confía en el archivo |

---

## Archivos base

### `main.js`: punto de entrada
**Deber ser:** arrancar la app y nada más. No debe tener lógica ni HTML.

Hace, en orden:
1. Importa los estilos (`../css/styles.css`); Vite los inyecta en la página.
2. Pone el mes actual en el formulario de recurrentes.
3. Aplica el tema guardado (`applyTheme`).
4. Genera los recurrentes pendientes (`runRecurring`).
5. Dibuja todo (`render`).
6. Abre la pestaña del `#hash` de la URL o la última usada.
7. Registra `resize` (para redibujar las gráficas) y `hashchange` (para cambiar de pestaña).
8. Si se generaron recurrentes, avisa con un `toast`.

### `core.js`: estado y utilidades compartidas
**Deber ser:** la única fuente del estado. Todos los demás leen de aquí. No debe importar vistas.

| Exporta | Para qué |
|---|---|
| `state` | Todos los datos: `tx`, `accounts`, `budgets`, `recurring`, `goals`, `cats`, `subcats`, `theme` |
| `month` | El mes seleccionado en la cabecera (`'YYYY-MM'`) |
| `setState(s)`, `setMonth(m)` | La única forma de **reemplazar** `state` o `month` desde otro módulo. `setState` también migra |
| `load()`, `save()` | Leer y guardar en `localStorage` (clave `controlGastos.v1`) |
| `DEFAULT`, `KEY`, `COLORS` | Estado inicial, clave de almacenamiento y paleta de categorías |
| `newId()` | Ids únicos aunque se creen varios en el mismo milisegundo |
| `today()` | Fecha de hoy |
| `$`, `esc`, `ic` | Atajo de `getElementById`, escape de HTML (obligatorio al pintar texto del usuario) e ícono SVG |
| `fmt`, `fmt0`, `monthName` | Formato de dinero en MXN (con y sin centavos) y nombre del mes en español |
| `allCats`, `catColor`, `account`, `accName` | Ayudas para categorías y cuentas |

> **Por qué hay `setState` y `setMonth`:** en módulos ES, quien importa una variable puede leerla y mutar sus propiedades (`state.tx.push(...)`), pero no reasignarla (`state = ...`). Para reemplazarla completa hay que pasar por el setter.

### `ui.js`: piezas de interfaz reutilizables
**Deber ser:** componentes genéricos de interfaz que no pertenecen a una sola pestaña.

| Exporta | Para qué |
|---|---|
| `toast(msg, icono)` | Aviso temporal abajo de la pantalla |
| `ask({title, msg, ok, danger, input})` | Diálogo propio de confirmación o de captura de un monto. Devuelve una promesa |
| `opts`, `fillCatSelect`, `fillAccSelect` | Llenar `<select>` de categorías y cuentas conservando la opción elegida |
| `closable(modal)` | Cierra un modal al hacer clic fuera o en `[data-close]` |
| `setTab(t)` | Cambia de pestaña, actualiza el `#hash` y redibuja la gráfica de esa pestaña |
| `applyTheme`, `isDark` | Tema claro u oscuro |

### `render.js`: orquestador
**Deber ser:** coordinar el redibujado. No debe pintar secciones propias salvo la cabecera.

`render()`:
1. Llena los `<select>` de cuentas.
2. Pinta la cabecera: balance, ingresos, gastos, ahorro, presupuesto y proyección.
3. Llama al `render*` de cada vista: `renderSummary`, `renderTx`, `renderAccounts`, `renderAnalysis`, `renderBudgets`, `renderRecurring`, `renderGoals`, `renderCats`.
4. Actualiza los contadores de las pestañas y los `<select>` de categorías.

**Si agregas una vista nueva, registra su `render*` aquí.**

---

## Capa de vistas

Cada vista sigue la misma estructura:

```js
import { ... } from './core.js';          // estado y utilidades
import { ... } from './logic/....js';     // cálculos
import { toast, ask } from './ui.js';     // interfaz común
import { render } from './render.js';     // para redibujar después de cambiar datos

export function renderAlgo(){ ... }        // pinta su sección; lo llama render()

$('miForm').addEventListener(...);         // eventos de su sección
window.accion = id => { ... };             // funciones que usa el HTML generado (onclick)
```

| Archivo | Pestaña o sección | Qué pinta | Qué maneja |
|---|---|---|---|
| `resumen.js` | Resumen | Avisos de tarjeta, proyección al cierre, calendario, gastos por categoría, comparativo y gráfica de 6 meses | Solo lectura. Exporta `drawChart()` para redibujar al cambiar el tamaño de la ventana o el tema |
| `movimientos.js` | Movimientos y ventana de movimiento | Lista agrupada por día, con etiquetas clicables | Filtros (incluidos periodo, rango y cuenta), la ventana de alta y edición con sus 3 tipos, eliminar, atajo **N** y **Esc**, y las flechas del mes. Exporta `filteredTx()` y `txFilters()` |
| `cuentas.js` | Cuentas | Patrimonio, tarjetas de cuenta y tarjetas de crédito con su estado | Ventana de cuenta, eliminar (mueve los movimientos a otra cuenta), **Pagar** tarjeta y **Transferir**. Exporta `cardAlerts()` para Resumen |
| `analisis.js` | Análisis | Totales del rango, gráfica de balance acumulado y desgloses | Rangos rápidos y fechas a elegir. Exporta `drawLine()` |
| `presupuestos.js` | Presupuestos | Barras con nivel y disponible | Guardar y quitar límites |
| `recurrentes.js` | Recurrentes | Lista ordenada por día y neto mensual | Programar, pausar o reanudar y eliminar. Exporta `runRecurring()`, que usa `main.js` |
| `metas.js` | Metas | Tarjetas con anillo de progreso | Crear, abonar, retirar y eliminar |
| `categorias.js` | Ajustes › Categorías | Chips de categorías | Añadir y eliminar |
| `datos.js` | Ajustes › Tus datos y botón CSV | — | Exportar CSV y JSON, importar (con validación) y borrar todo |

### Funciones globales `window.*`

El HTML que generan las vistas usa `onclick="..."`, que solo ve funciones globales. Por eso estas se publican en `window`:

| Función | Archivo |
|---|---|
| `openTx(id?, preset?)`, `delTx`, `filterTag` | `movimientos.js` |
| `openAcc`, `delAcc`, `payCard`, `showAccount` | `cuentas.js` |
| `delBudget` | `presupuestos.js` |
| `toggleRec`, `delRec` | `recurrentes.js` |
| `moveGoal`, `delGoal` | `metas.js` |
| `delCat` | `categorias.js` |

`openTx(null, { type: 'transferencia', to: 'tarjeta', amount: 500 })` abre la ventana ya llena; así funciona el botón **Pagar** de las tarjetas.

---

## Modelo de datos (`state`)

```js
{
  tx: [{                         // movimientos
    id: 1730000000000,
    type: 'gasto',               // 'gasto' | 'ingreso' | 'transferencia'
    date: '2026-10-25',
    desc: 'Supermercado',
    amount: 450.5,
    account: 'banco',            // cuenta de origen
    to: 'tarjeta',               // solo en transferencias: cuenta destino
    cat: 'Alimentación',         // no existe en transferencias
    sub: 'Súper',                // opcional
    tags: ['viaje'],             // opcional
    note: '',
    recId: 99,                   // si lo generó un recurrente
    method: 'Efectivo'           // solo en datos antiguos; hoy se usa account
  }],
  accounts: [{ id, name, kind, initial, limit?, cutDay?, payDay? }],   // initial < 0 en crédito = deuda
  budgets: { 'Alimentación': 3500 },
  recurring: [{ id, type, desc, amount, cat, account, day, start: 'YYYY-MM', lastGen: 'YYYY-MM' | null, active }],
  goals: [{ id, name, target, saved, deadline: 'YYYY-MM' }],
  cats: { gasto: [...], ingreso: [...] },
  subcats: { 'Alimentación': ['Súper', 'Restaurantes'] },
  theme: null | 'light' | 'dark'
}
```

Si agregas un campo nuevo:
1. Ponle valor por defecto en `DEFAULT` (`core.js`).
2. Si los datos viejos lo necesitan, complétalo en `migrate()` (`logic/cuentas.js`).
3. Acéptalo y valídalo en `sanitizeBackup()` (`logic/datos.js`); si no, se pierde al restaurar un respaldo.

---

## Cómo agregar algo nuevo

**Un cálculo nuevo:**
1. Escríbelo como función pura en el archivo de `logic/` que corresponda.
2. Agrega sus pruebas en `tests/` y corre `npm test`.
3. Úsalo desde la vista.

**Una pestaña nueva:**
1. Agrega el botón en `.tabs` y su `<section class="panel" data-panel="nombre" hidden>` en `index.html`.
2. Crea `src/js/nombre.js` con `export function renderNombre()`.
3. Impórtalo y llámalo en `render()` (`render.js`).
4. Si tiene una gráfica que depende del ancho, redibújala en `setTab()` (`ui.js`) y en `resize` (`main.js`).
5. Agrega la pestaña a la lista de `check.cjs` y corre `npm run check`.

**Antes de dar algo por terminado:** `npm test` (lógica) y `npm run check` (navegador: recorre todas las pestañas, registra un gasto y una transferencia, y revisa errores y desbordes en escritorio y celular).
