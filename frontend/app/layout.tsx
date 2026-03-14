import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Paramedic Triage System",
  description: "Real-time paramedic triage dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-zinc-950 text-white`}
      >
        <nav className="border-b border-zinc-800 px-6 py-3 flex gap-6 font-mono text-sm">
          <a href="/" className="text-zinc-400 hover:text-white transition-colors uppercase tracking-widest">
            EKG Monitor
          </a>
          <a href="/triage" className="text-zinc-400 hover:text-white transition-colors uppercase tracking-widest">
            Triage Form
          </a>
        </nav>
        {children}
      </body>
    </html>
  );
}
