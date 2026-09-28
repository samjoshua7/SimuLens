import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SimuLens — Uncertainty-Aware Causal World Model',
  description:
    'See what happens before you change the system. An uncertainty-aware system reasoning engine for predictions, interventions, and counterfactuals.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ background: '#070b14', color: '#f1f5f9', margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
