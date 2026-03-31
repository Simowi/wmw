import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: "Where's My Williamsburg",
  description: 'Glipp i Matrisen – finn den kule delen av byen',
  manifest: '/manifest.json',
  themeColor: '#0a0a0a',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="no">
      <body>{children}</body>
    </html>
  );
}
