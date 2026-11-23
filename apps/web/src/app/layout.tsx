import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seiton-Social Media | 1-Pintu Multi-Agent Orchestrator",
  description:
    "Pusat kendali lokal orkestrasi promosi Seiton.id lintas TikTok, Threads, X, Instagram, dan Facebook.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="dark">
      <body className="min-h-screen bg-[#070b14] text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
