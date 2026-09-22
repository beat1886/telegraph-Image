import { auth } from "@/auth";
import HomePage from "@/components/HomePage";

export const runtime = 'edge';

export default async function Page() {
  const session = await auth();
  const initialRole = session?.user?.role || null;
  return <HomePage initialRole={initialRole} />;
}
