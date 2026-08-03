import Link from "next/link";

export const dynamic = "force-static";

export default function OAuthDeclinedPage() {
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Autorisation refusée</h1>
      <p className="mt-2 text-sm text-muted">
        Vous avez refusé l’accès eBay. Aucun compte n’a été connecté.
      </p>
      <Link
        href="/settings/connections"
        className="mt-6 text-sm font-medium underline-offset-2 hover:underline"
      >
        Retour aux connexions
      </Link>
    </main>
  );
}
