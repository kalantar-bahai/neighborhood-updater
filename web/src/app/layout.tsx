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
    // suppressHydrationWarning: some browsers (e.g. Chrome on iOS adds __gcrremoteframetoken)
    // inject attributes onto <html> before React hydrates. It only silences attribute
    // mismatches on this one element, not on its children.
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
