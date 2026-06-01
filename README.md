# Otakross

Otakross est une application statique (HTML/CSS/JavaScript) pour générer des mots croisés sur le thème anime/manga.

## Fonctionnalités

- Génération de grilles horizontales et verticales depuis une liste de mots.
- Mode jeu avec lettres masquées, saisie automatique, validation du mot complet et progression.
- Création de compte, connexion, profil et synchronisation Firebase Realtime Database.
- Grille journalière de 10 mots (5 horizontaux / 5 verticaux) avec sélection équilibrée par difficulté, ELO réservé à ce mode, scoring dépendant du temps et tentative classée unique.
- Mot mystère quotidien avec lettres rouges, bonus score/ELO et classement daily Top 10.
- Profil joueur enrichi : avatar, date d’inscription, rang, grilles complétées, réussite, meilleur temps et streak.
- Sauvegardes locales et synchronisées dans le navigateur pour reprendre une partie.
- Mise en page imprimable pour utiliser la grille hors ligne.
- Classification des mots par difficulté : Genin, Chunin, Jonin et Sensei.

## Développement local

Aucun build n'est nécessaire. Lance un petit serveur statique pour que le navigateur puisse charger les fichiers JSON de thèmes depuis `data/themes/`.

```bash
python3 -m http.server 4173
```

Puis va sur <http://localhost:4173>.


## Données de thèmes

La bibliothèque de thèmes est rangée dans `data/themes/` :

- `index.json` liste les thèmes disponibles et le fichier JSON associé.
- Chaque fichier de thème contient un objet `{ "theme": "...", "words": [...] }`. Chaque mot expose `word`, `description`, `theme` et `difficulty` (`Genin`, `Chunin`, `Jonin` ou `Sensei`).

## Déploiement GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` prépare un dossier `_site`, l'envoie une seule fois avec `actions/upload-pages-artifact@v3`, puis le déploie avec `actions/deploy-pages@v4`. Cela évite l'erreur GitHub Pages où plusieurs artefacts nommés `github-pages` sont trouvés dans la même exécution.


## Difficultés des grilles

Les grilles personnalisées peuvent être générées avec un profil de difficulté :

- Facile : 6 Genin, 3 Chunin, 1 Jonin.
- Moyenne : 4 Genin, 4 Chunin, 2 Jonin.
- Difficile : 2 Genin, 4 Chunin, 3 Jonin, 1 Sensei.

Si la liste ne contient pas assez de mots dans un niveau, Otakross complète avec les autres mots disponibles pour atteindre la taille demandée.
