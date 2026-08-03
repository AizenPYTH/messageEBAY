# Architecture — eBay AI Seller Assistant

## Vue d’ensemble

Le dépôt est un monorepo npm workspaces :

| Chemin | Rôle |
|--------|------|
| `src/` | **Source de vérité** — AI Engine, Prompt, RAG, Database, Seller, eBay, Analysis |
| `apps/web` | Application SaaS Next.js 15 (UI + adaptateurs serveur) |
| `supabase/migrations` | Schéma Postgres (`ebay_ai`) |
| CLI racine (`npm run ai`, `inbox`, …) | Preuve de concept / debug — conservée |

```
UI (React) → Server Actions / RSC → apps/web/src/server/* → src/* (moteur)
```

La UI ne réimplémente jamais la logique métier. Elle appelle le moteur via des adaptateurs minces dans `apps/web/src/server/`.

## Alias

Dans `apps/web` :

- `@/*` → `apps/web/src/*`
- `@ebay-ai/core/*` → `src/*` (racine)

`next.config.ts` active `experimental.externalDir` et un alias Turbopack/Webpack vers `../../src`.

## Auth + multi-vendeur

1. **Compte app** — Supabase Auth (magic link e-mail) → `ebay_ai.app_profiles`
2. **Liaison eBay** — OAuth web (`/api/ebay/connect` → callback) → `ebay_ai.user_connections` (tokens AES-GCM)
3. **Injection token** — `runWithEbayToken` / `withUserEbayToken` ; CLI continue via `.env`

Si `NEXT_PUBLIC_SUPABASE_*` absents : mode soft (routes ouvertes, token `.env`).

## Config lazy

`src/config.ts` lit les variables eBay **à l’accès** (getters). Importer le module n’échoue plus si les vars sont absentes — nécessaire pour démarrer le web sans casser les CLIs.

## Déploiement Vercel

1. Importer le dépôt
2. **Root Directory** = `.` (racine du monorepo — obligatoire pour accéder à `src/`)
3. Framework = Next.js
4. Install = `npm install`
5. Build = `npm run web:build`
6. Variables d’environnement : voir `.env.example`

Secrets serveur : `EBAY_*`, `TOKEN_ENCRYPTION_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.  
Public : `NEXT_PUBLIC_SUPABASE_*`, `NEXT_PUBLIC_APP_URL`.

## Scripts

```bash
# CLI (inchangé)
npm run auth
npm run inbox
npm run ai -- <conversationId>

# Web
npm run web          # dev — http://localhost:3000
npm run web:build
npm run web:start
```

## Phase 2 — Conversations web

La page `/conversations` appelle uniquement des adaptateurs serveur :

| Action UI | Module réutilisé |
|-----------|------------------|
| Liste inbox | `src/conversations/inboxService.ts` (`loadInboxItems`) |
| Détail | `buildAssistantContext` + seller profile |
| Générer | `createDefaultAiEngine().run()` |
| Envoyer | `src/ebay/sendMessage.ts` (même appel que CLI reply/autoreply) |
| Sync | `syncConversationToDatabase` |

Le CLI (`npm run inbox`, `ai`, `reply`, …) reste disponible.

## Prochaines étapes

1. Google OAuth (bouton déjà présent, désactivé)
2. Historique des générations en base
3. Billing / plans
