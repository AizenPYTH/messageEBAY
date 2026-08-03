export const dynamic = "force-static";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-sm leading-relaxed text-foreground">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-4 text-muted">
        Last updated: August 3, 2026
      </p>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold">Who we are</h2>
        <p>
          eBay AI Message (“the Application”) helps eBay sellers manage buyer
          messages with AI-assisted replies.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold">Data we access</h2>
        <p>
          When you connect your eBay account, the Application may access eBay
          message data, listing information needed to answer buyers, and your
          eBay username in order to operate the service on your behalf.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold">How we use data</h2>
        <p>
          Data is used solely to sync conversations, generate draft replies,
          send messages you approve, and improve your seller workflow. We do not
          sell your data.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold">Storage & security</h2>
        <p>
          eBay access tokens are stored encrypted on our servers. You can
          disconnect your eBay account at any time from the Application
          settings.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-base font-semibold">Contact</h2>
        <p>
          For privacy questions, contact the Application operator through your
          usual support channel.
        </p>
      </section>
    </main>
  );
}
