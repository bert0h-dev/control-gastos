# Control de Gastos

Control de gastos personales: movimientos, presupuestos, recurrentes, metas de ahorro y comparativo mensual. Los datos se guardan en el `localStorage` del navegador.

## Comandos

```bash
npm install       # primera vez
npm run dev       # servidor de desarrollo con recarga automática (http://localhost:5173)
npm run build     # versión optimizada en dist/
npm run preview   # sirve dist/ para probarla
npm test          # pruebas unitarias de la lógica (Vitest)
npm run check     # revisión en Edge: recorre las pestañas, registra un gasto y guarda capturas en capturas/
```

## Estructura

```
index.html            estructura de la página
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
