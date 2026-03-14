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
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-100`}
      >
        <nav className="border-b border-slate-800/60 bg-slate-900/40 px-6 py-3 flex gap-6 text-sm font-medium">
          <a href="/" className="text-slate-400 hover:text-white transition-colors uppercase tracking-widest">
            EKG Monitor
          </a>
          <a href="/triage" className="text-slate-400 hover:text-white transition-colors uppercase tracking-widest">
            Voice Triage
          </a>
        </nav>
        {children}
      </body>
    </html>
  );
}
