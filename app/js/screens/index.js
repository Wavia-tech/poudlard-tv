// Registre des écrans. Chaque module exporte { mount, unmount, onKey }.
import home from './home.js';
import library from './ollivanders.js';
import map from './map.js';
import settings from './settings.js';
import sorting from './sorting.js';
import classic from './classic.js';

export const SCREENS = { home, library, map, settings, sorting, classic };
