# FF ROOM CITY V3.2 — KAWAKI227

Version online avec suppression sécurisée des rooms et expiration automatique.

## Fonctionnalités
- Rooms partagées via Node.js + Express + SQLite.
- Synchronisation automatique toutes les 5 secondes.
- Formats : 1v1, 1v2, 2v2, 2v3, 2v4, 3v3, 3v4, 3v5, 3v6, 1v6, 2v6.
- Création avec récompense, téléphone, ID squad/joueur, créateur, heure et règles.
- **Suppression sécurisée :** chaque nouvelle room reçoit une clé secrète unique. La clé est stockée uniquement sur l'appareil du créateur et son hash est stocké sur le serveur. Un autre joueur ne peut pas supprimer la room sans cette clé.
- **Expiration automatique :** par défaut, une room est supprimée 24 h après sa création.
- Le délai est configurable avec la variable d'environnement `ROOM_TTL_HOURS` (minimum 1 heure).

## Déploiement Render
- Build : `npm install`
- Start : `npm start`
- Node : `20.x`
- Optionnel : `ROOM_TTL_HOURS=24`

## Important
Pour que les rooms survivent aux redémarrages du service, SQLite doit être placé sur un stockage persistant ou remplacé par une base de données persistante. Le stockage local d'une instance gratuite peut être éphémère.

Contact : KAWAKI227 • +227 81 28 94 18
