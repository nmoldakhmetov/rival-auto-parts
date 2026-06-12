import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import CartSync from "@/components/CartSync";
import BlockOverlay from "@/components/BlockOverlay";
import Toasts from "@/components/Toasts";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  let blocked: {
    message: string;
    manager: { fullName: string; phone: string | null; email: string | null } | null;
  } | null = null;
  let manager: { fullName: string; phone: string | null; email: string | null } | null =
    null;
  let balance: number | null = null;
  if (session.role === "CLIENT") {
    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      select: {
        isActive: true,
        balance: true,
        manager: { select: { fullName: true, phone: true, email: true } },
      },
    });
    manager = user?.manager ?? null;
    balance = user ? Number(user.balance) : null;
    if (user && !user.isActive) {
      blocked = {
        message: await getSetting("blocked_message"),
        manager: user.manager,
      };
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <CartSync enabled={session.role === "CLIENT"} />
      <Sidebar
        role={session.role}
        fullName={session.fullName}
        login={session.login}
        balance={balance}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header manager={manager} />
        <main className="min-h-0 flex-1 overflow-auto bg-[#f3f4f6]">
          {children}
        </main>
      </div>
      {blocked && (
        <BlockOverlay message={blocked.message} manager={blocked.manager} />
      )}
      <Toasts />
    </div>
  );
}
