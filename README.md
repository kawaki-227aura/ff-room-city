# FF ROOM CITY V3 FINAL — KAWAKI227

Cette version combine le style visuel de la V1 avec le système online de la V3.

### Inclus
- Design mobile premium inspiré de la V1 : cartes de rooms, animations, badge ACTIVE, boutons VOIR LA ROOM / WA.
- Types : 1v1, 1v2, 2v2, 2v3, 2v4, 3v3, 3v4, 3v5, 3v6, 1v6, 2v6.
- Récompenses : Booyah Pass, Diamants, Autre, Rien.
- Création : type, récompense, téléphone, ID squad/joueur, créateur, date/heure et règle optionnelle.
- Rooms partagées via SQLite côté serveur.
- Synchronisation automatique toutes les 5 secondes : pas besoin de recharger.
- Alerte visuelle quand une nouvelle room arrive.
- Recherche + filtres.
- Détails de room + contact WhatsApp.
- Pas de notifications push/VAPID.
- PWA manifest.

### Déploiement
Le projet doit être déployé sur un hébergement qui exécute Node.js.

Commandes :
npm install
npm start

Ne pas mettre uniquement le dossier `public` sur un hébergement statique.

### Base de données
La base est `data/rooms.db`. Utilise un disque persistant sur l'hébergeur et, si nécessaire, définis `DATA_DIR` vers ce disque pour éviter la perte des rooms après un redémarrage.

### Contact
KAWAKI227 — +227 81 28 94 18
