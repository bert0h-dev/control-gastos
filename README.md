# Control de Gastos

[![CI](https://github.com/bert0h-dev/control-gastos/actions/workflows/ci.yml/badge.svg)](https://github.com/bert0h-dev/control-gastos/actions/workflows/ci.yml)

Control de gastos personales: movimientos, cuentas y tarjetas, presupuestos, recurrentes, metas de ahorro y análisis. Los datos se guardan en una base **SQLite** local (`data/gastos.db`), con una copia en el navegador por si el servidor no responde.

Requiere **Node 22.13 o superior** (usa el módulo integrado `node:sqlite`).

## Uso diario

```bash
npm run build     # una vez, o después de cada cambio al código
npm start         # abre http://localhost:3000
```

Para usarla desde el celular en la misma red Wi-Fi, arráncala con `HOST=0.0.0.0` (en PowerShell: `$env:HOST="0.0.0.0"; npm start`) y entra a `http://IP-de-tu-PC:3000`. **No tiene inicio de sesión:** cualquiera en tu red podría verla, así que úsalo solo en redes de confianza.

**Respaldo:** copia `data/gastos.db` (con la app cerrada), o descarga el respaldo JSON desde Ajustes. Otra ruta para la base: variable `GASTOS_DB`.

## Comandos

```bash
npm install       # primera vez
npm run dev       # desarrollo con recarga automática (http://localhost:5173); incluye la API de SQLite
npm start         # producción: sirve dist/ y la API (http://localhost:3000)
npm run build     # versión optimizada en dist/
npm run preview   # sirve dist/ para probarla
npm test          # pruebas unitarias de la lógica (Vitest)
npm run lint      # ESLint
npm run format    # aplica Prettier
npm run check     # revisión en Edge: recorre las pestañas, registra un gasto y guarda capturas en capturas/
```

## Estructura

```
index.html            estructura de la página
server/db.js          esquema SQLite, lectura y escritura del estado (único archivo que conoce la base)
server/api.js         API HTTP: GET y PUT /api/state, valida con sanitizeBackup()
server/index.js       servidor de producción (dist/ + API)
vite.config.js        conecta la API al servidor de Vite en desarrollo
data/                 la base de datos (ignorada por Git)
public/               archivos que se copian tal cual (favicon)
src/css/styles.css    estilos y tokens de color (modo claro y oscuro)
src/js/logic/         lógica pura sin DOM (fechas, cálculos, cuentas, análisis, recurrentes, datos); la cubren las pruebas de tests/
src/js/main.js        punto de entrada: arranque de la app
src/js/core.js        estado, constantes, utilidades de fecha y dinero, guardar/cargar
src/js/ui.js          avisos, diálogos, pestañas y tema
src/js/render.js      render() general y cabecera
src/js/resumen.js     gastos por categoría, comparativo y gráfica
src/js/movimientos.js lista, filtros y modal de alta/edición
src/js/cuentas.js     cuentas, transferencias y tarjetas de crédito
src/js/analisis.js    análisis por rango de fechas
src/js/presupuestos.js, recurrentes.js, metas.js, categorias.js, datos.js
```

La explicación completa de cada archivo, el orden de carga y las reglas está en [docs/arquitectura-js.md](docs/arquitectura-js.md).

`state` y `month` viven en `core.js`. Desde otros módulos se leen importándolos y se cambian con `setState()` y `setMonth()`.

## Integración continua

En cada `push` o pull request a `main`, GitHub Actions (`.github/workflows/ci.yml`) revisa formato, lint, pruebas y compilación, y después recorre la app en Chromium con `npm run check`. Las capturas quedan como artefacto de la ejecución durante 7 días.
