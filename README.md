# SLAM-ANIME

Manga Grid Quest est une application statique (HTML/CSS/JavaScript) pour générer des mots croisés sur le thème anime/manga.

## Fonctionnalités

- Génération de grilles horizontales et verticales depuis une liste de mots.
- Mode jeu avec lettres masquées, saisie automatique, validation du mot complet et progression.
- Sauvegardes locales dans le navigateur pour reprendre une partie.
- Mise en page imprimable pour utiliser la grille hors ligne.

## Développement local

Aucun build n'est nécessaire : ouvre `index.html` dans un navigateur ou lance un petit serveur statique.

```bash
python3 -m http.server 4173
```

Puis va sur <http://localhost:4173>.

## Déploiement GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` prépare un dossier `_site`, l'envoie une seule fois avec `actions/upload-pages-artifact@v3`, puis le déploie avec `actions/deploy-pages@v4`. Cela évite l'erreur GitHub Pages où plusieurs artefacts nommés `github-pages` sont trouvés dans la même exécution.
