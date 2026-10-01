import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { PasskeyLogin } from "@/components/auth/PasskeyLogin";
import { getSession } from "@/lib/auth/guard";

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  return (
    <AuthCard title="Welcome back">
      <PasskeyLogin />
    </AuthCard>
  );
}
