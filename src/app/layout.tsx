import type { Metadata } from "next";
import { SessionProvider } from "@/components/session";
import "./globals.css";
export const metadata: Metadata = { title: "JobApply", description: "Organize job applications and prepare with personalized CV analysis." };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body className="font-sans antialiased"><SessionProvider>{children}</SessionProvider></body></html>; }
