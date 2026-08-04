import { AppShell } from "@/components/layout/app-shell";
import { SellerProfileForm } from "@/features/seller-profile/seller-profile-form";
import { loadSellerProfileForm } from "@/server/sellerProfile";

export const dynamic = "force-dynamic";

export default async function SellerProfilePage() {
  const result = await loadSellerProfileForm();

  return (
    <AppShell
      title="Mon style"
      description="Comment l’assistant doit vous parler aux clients"
    >
      <SellerProfileForm
        initial={result.ok ? result.data : null}
        loadError={result.ok ? undefined : result.error}
      />
    </AppShell>
  );
}
