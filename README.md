# eBay AI Message

Assistant IA pour vendeurs eBay — moteur TypeScript partagé + application web SaaS (Next.js).

## Démarrage rapide

### Prérequis

- Node.js 20+
- Compte eBay développeur + token OAuth (`npm run auth`)
- Clé OpenAI
- Projet Supabase (schema `ebay_ai`)

### Installation

```bash
npm install
cp .env.example .env
# renseigner les variables
```

### CLI (debug / POC)

```bash
npm run auth
npm run inbox
npm run ai -- <conversationId>
npm run sync -- <conversationId>
npm run refs -- --gaps            # codes produit du catalogue sans référence
npm run audit                     # ce que le bot dirait sur ta vraie boîte, sans rien envoyer
```

### Application web

```bash
npm run web
```

Ouvre [http://localhost:3000](http://localhost:3000) — redirection vers le Dashboard.

Build production :

```bash
npm run web:build
npm run web:start
```

## Architecture

Voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

- Moteur : [`src/`](src/) (AI Engine, Prompt, RAG, Database, Seller, eBay)
- Web : [`apps/web`](apps/web) — UI Next.js 15, réutilise le moteur via `@ebay-ai/core/*`
- Le CLI continue de fonctionner ; les nouvelles features utilisateurs partent du web

## Variables d’environnement

Voir [`.env.example`](.env.example).

| Variable | Usage |
|----------|--------|
| `EBAY_*` | OAuth app + Message/Trading API |
| `EBAY_RUNAME` | Redirect vers `/api/ebay/callback` (web) |
| `TOKEN_ENCRYPTION_KEY` | Chiffrement tokens vendeur en DB |
| `OPENAI_API_KEY` | Génération + embeddings |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Persistance / RAG (serveur) |
| `NEXT_PUBLIC_SUPABASE_*` | Auth navigateur (magic link) |
| `NEXT_PUBLIC_APP_URL` | URL publique (redirect OAuth) |
| `AUTOPILOT_ENABLED` | `false` coupe l'auto-réponse sans toucher aux crons |
| `AUTOPILOT_DRY_RUN` | `true` calcule et logue les brouillons, n'envoie rien |
| `EBAY_MARKETPLACE_ID` | Marché pour la Browse API (défaut `EBAY_FR`) |

## Répondre juste, ou se taire

Le moteur ne répond « oui » que s'il peut établir que l'annonce est bien le
produit demandé. Trois idées portent tout le reste :

- **Identité produit** (`src/product/identity.ts`) — marque + modèle + code
  constructeur, extraits de la question ET de l'annonce (titre, caractéristiques,
  SKU, liste de compatibilité). Deux identités connues et différentes : jamais de
  « oui », jamais de lien.
- **Table de références** (`src/product/references.ts`) — ce qu'un code désigne
  vraiment. « Galaxy A13 4G » couvre A135F *et* A137F, « MacBook Pro 13 » sept
  écrans : sans preuve, on se tait. Un code inconnu coûte un silence, jamais une
  erreur.
- **Garde-fou avant envoi** (`src/ai/replyQuality.ts`) — dernier filet, quel que
  soit le chemin emprunté (template ou modèle).

### Enrichir les références

```bash
npm run refs -- A137F A1989       # ce que sont ces codes
npm run refs -- --gaps            # codes du catalogue encore sans référence
npm run refs -- --gaps --learn    # les demander à eBay (Browse API) et les enregistrer
npm run refs -- --list            # tout ce qui a été appris
```

`--learn` lit le catalogue public eBay avec un token application : il ne touche
pas au compte vendeur, ne tourne jamais pendant une réponse client, et ne retient
une lecture que si le marché est d'accord avec lui-même. Les résultats sont
stockés en base (`ebay_ai.product_references`, migration
`20260916120000_product_references.sql`) et chargés en mémoire au démarrage de
l'autopilot.

### Vérifier avant de lancer

```bash
npm run audit                 # les 20 fils en attente de réponse
npm run audit -- --limit 50   # plus de fils
npm run audit -- --json       # sortie comparable d'un run à l'autre
```

Rien n'est envoyé : chaque ligne montre la demande, la branche qui a décidé, et
le brouillon ou le motif du silence. C'est l'étape entre « les tests passent » et
« l'autopilot est actif ».

### Couper l'auto-réponse

```bash
npm run autopilot:status   # quels profils envoient encore
npm run autopilot:off      # coupe l'auto-réponse sur TOUS les profils
```

Puis, côté hébergeur, pour arrêter le cron lui-même :

```bash
AUTOPILOT_ENABLED=false   # rien n'est lu, rien n'est envoyé
AUTOPILOT_DRY_RUN=true    # brouillons calculés et logués, jamais envoyés
```

> **Le bouton de l'interface ne coupe qu'un profil.** Avec `SKIP_AUTH`, un
> vendeur est identifié par un cookie de navigateur : une même boutique peut
> donc posséder plusieurs profils (un par navigateur, par appareil, ou par
> cookie effacé). Chacun garde son propre jeton eBay et continue de répondre.
> `npm run autopilot:off` les atteint tous ; la réponse du cron liste désormais
> `activeProfiles` pour voir lesquels tournent.

### Parcours SaaS

1. Créer un compte sur `/login` (magic link Supabase)
2. Connecter eBay dans **Paramètres → Connexions**
3. Utiliser Conversations (sync / générer / envoyer) sans token `.env` utilisateur

## Licence

ISC
