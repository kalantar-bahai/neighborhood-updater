import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Neighborhood Coordinator',
  description: 'View and update neighborhood data',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
