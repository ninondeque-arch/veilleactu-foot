import "@fontsource-variable/inter";
import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import { modeDemo } from "@/lib/demo";

export const metadata: Metadata = {
  title: "Veille foot & carrousels — démo",
  description: "Démo d'un workflow éditorial assisté par IA : veille, génération, relecture, test de risque, validation humaine, export.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {modeDemo() && <div className="bandeau-demo">Version démo — la génération par IA est présentée en entretien.</div>}
        <header className="barre">
          <Link href="/" className="barre-marque">
            Veille foot <span>·</span> Carrousels
          </Link>
          <nav>
            <Link href="/">Veille & carrousels</Link>
            <Link href="/reporting">Reporting</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
