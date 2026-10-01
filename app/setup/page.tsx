import { AuthCard } from "@/components/auth/AuthCard";
import { PasskeySetup } from "@/components/auth/PasskeySetup";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Set up this device">
      {token ? (
        <PasskeySetup setupToken={token} />
      ) : (
        <p className="text-sm text-ink-muted">
          Open the setup link from <code className="font-mono">pnpm setup-token</code> or from
          Settings → Devices on a signed-in device.
        </p>
      )}
    </AuthCard>
  );
}
