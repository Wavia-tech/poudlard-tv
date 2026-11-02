// Adaptateur plateforme : la seule porte vers l'extérieur de l'interface.
// Sur le web (maquette) : on simule, sauf pour les liens de films (ouverts dans un nouvel onglet, pour tester).
// Dans le launcher Android : un pont `window.Android` exposé par la WebView, limité à des actions explicites
// (lancer une appli par package, changer d'entrée HDMI, ouvrir un lien d'une liste blanche dans l'appli qui le possède).
// Aucune URL arbitraire, aucun accès réseau, aucune donnée transmise hors du nom d'appli et du lien configuré.

const bridge = () => (typeof window !== 'undefined' && window.Android && typeof window.Android.launch === 'function') ? window.Android : null;
// Hôtes autorisés pour les liens de contenu (config.js). Tout autre lien est refusé, même s'il vient du stockage.
const URL_HOSTS = new Set(['www.max.com', 'play.max.com', 'www.netflix.com', 'www.primevideo.com', 'www.disneyplus.com', 'www.youtube.com']);

function allowedUrl(url) {
  try { const u = new URL(String(url)); return (u.protocol === 'https:' && URL_HOSTS.has(u.hostname)) ? u.href : null; } catch (e) { return null; }
}

export const Platform = {
  isTV: () => Boolean(bridge()),

  // Lance une appli. Retourne 'bridge' si la TV a pris la main, 'simulated' sinon.
  launch(app) {
    const b = bridge();
    if (b && app.pkg) { b.launch(String(app.pkg)); return 'bridge'; }
    if (b && app.input && typeof b.switchInput === 'function') { b.switchInput(String(app.input)); return 'bridge'; }
    return 'simulated';
  },

  // Ouvre un contenu précis : `item.url` (liste blanche d'hôtes) dans l'appli qui le possède.
  // À appeler depuis un geste utilisateur (OK), sinon le navigateur bloque l'ouverture en maquette.
  openContent(app, item) {
    const url = item && allowedUrl(item.url);
    const b = bridge();
    if (url && b && typeof b.openUrl === 'function') { b.openUrl(url, String(app.pkg || '')); return 'bridge'; }
    if (url) { try { const w = window.open(url, '_blank', 'noopener'); if (w) return 'opened'; } catch (e) { /* fenêtre bloquée : on simule */ } }
    return this.launch(app);
  },

  // Liste des applis réellement installées (le vrai launcher la fournit ; la maquette dit "toutes").
  installed() {
    const b = bridge();
    if (b && typeof b.installedPackages === 'function') {
      try { return new Set(JSON.parse(b.installedPackages())); } catch (e) { return null; }
    }
    return null;
  },
};
