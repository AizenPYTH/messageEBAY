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

### Parcours SaaS

1. Créer un compte sur `/login` (magic link Supabase)
2. Connecter eBay dans **Paramètres → Connexions**
3. Utiliser Conversations (sync / générer / envoyer) sans token `.env` utilisateur

## Licence

ISC
