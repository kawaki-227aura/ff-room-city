# FF ROOM CITY V3.3 — KAWAKI227

V3.3 ajoute un Owner Panel privé pour KAWAKI227.

## Fonctionnalités
- Rooms partagées via SQLite + Express
- Synchronisation automatique toutes les 5 secondes
- Expiration automatique des rooms (24h par défaut)
- Suppression personnelle sécurisée par clé unique
- **Owner Panel `/admin.html`** avec connexion par code
- Suppression d'une room ou de plusieurs rooms sélectionnées
- Le code propriétaire est lu depuis la variable d'environnement `ADMIN_CODE` et n'est pas dans GitHub

## Configuration Render
Dans **Environment** du Web Service, ajoute :

- `ADMIN_CODE` = ton code propriétaire
- `ROOM_TTL_HOURS` = `24` (optionnel)

Render peut injecter ces variables au runtime. Ne mets pas le code dans `server.js`, `index.html` ou `render.yaml`.

## Owner Panel
Ouvre `/admin.html` sur le même domaine que le site.

Le panneau est destiné au propriétaire. La session admin est temporaire (12h) et signée côté serveur.
