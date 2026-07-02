import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nucleus Assistant',
  description: 'View and update nucleus data',
  openGraph: {
    title: 'Nucleus Assistant',
    description: 'View and update nucleus data',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
