// Estado inicial de la app. Lo usan el navegador (core.js) y el servidor (server/)
import { DEFAULT_ACCOUNTS } from './cuentas.js';

export const DEFAULT = {
  tx: [], budgets: {}, recurring: [], goals: [], accounts: DEFAULT_ACCOUNTS, subcats: {},
  cats: {
    gasto: ['Alimentación','Transporte','Vivienda','Servicios','Salud','Entretenimiento','Educación','Ropa','Otros'],
    ingreso: ['Salario','Freelance','Inversiones','Regalos','Otros ingresos']
  },
  theme: null,          // modo: null (sistema), 'light' o 'dark'
  palette: 'esmeralda'  // paleta de logic/temas.js
};
