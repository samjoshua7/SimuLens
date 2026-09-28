import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SimuLens — Uncertainty-Aware Causal World Model',
  description: 'See what happens before you change the system. An uncertainty-aware system reasoning engine for predictions, interventions, and counterfactuals.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#090d16] text-slate-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
