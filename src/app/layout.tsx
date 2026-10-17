import type { Metadata } from "next";
import { SessionProvider } from "@/components/session";
import { ThemeProvider } from "@/components/theme-provider";
import { themeBootstrap } from "@/lib/theme";
import "./globals.css";
import "./theme.css";
export const metadata: Metadata = { title: "JobApply", description: "Organize job applications and prepare with personalized CV analysis." };
export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html:themeBootstrap }}/></head><body className="font-sans antialiased"><ThemeProvider><SessionProvider>{children}</SessionProvider></ThemeProvider></body></html>; }
