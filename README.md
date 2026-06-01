# Otakross

Otakross est une application statique (HTML/CSS/JavaScript) pour générer des mots croisés sur le thème anime/manga.

## Fonctionnalités

- Génération de grilles horizontales et verticales depuis une liste de mots.
- Mode jeu avec lettres masquées, saisie automatique, validation du mot complet et progression.
- Création de compte, connexion, profil et synchronisation Firebase Realtime Database.
- Grille journalière de 10 mots (5 horizontaux / 5 verticaux) avec ELO réservé à ce mode, scoring dépendant du temps et tentative classée unique.
- Mot mystère quotidien avec lettres rouges, bonus score/ELO et classement daily Top 10.
- Profil joueur enrichi : avatar, date d’inscription, rang, grilles complétées, réussite, meilleur temps et streak.
- Sauvegardes locales et synchronisées dans le navigateur pour reprendre une partie.
- Mise en page imprimable pour utiliser la grille hors ligne.

## Développement local

Aucun build n'est nécessaire. Lance un petit serveur statique pour que le navigateur puisse charger les fichiers JSON de thèmes depuis `data/themes/`.

```bash
python3 -m http.server 4173
```

Puis va sur <http://localhost:4173>.


## Données de thèmes

La bibliothèque de thèmes est rangée dans `data/themes/` :

- `index.json` liste les thèmes disponibles et le fichier JSON associé.
- Chaque fichier de thème contient un objet `{ "theme": "...", "words": [...] }` avec les mots et leurs descriptions.

## Déploiement GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` prépare un dossier `_site`, l'envoie une seule fois avec `actions/upload-pages-artifact@v3`, puis le déploie avec `actions/deploy-pages@v4`. Cela évite l'erreur GitHub Pages où plusieurs artefacts nommés `github-pages` sont trouvés dans la même exécution.
