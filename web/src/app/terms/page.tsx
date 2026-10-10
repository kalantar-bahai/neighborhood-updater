import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service — Nucleus Assistant',
};

export default function TermsPage() {
  return (
    <div className="legal-page">
      <div className="legal-page-body">
        <h1>Terms of Service</h1>
        <p>
          Nucleus Assistant is a volunteer community tool, built to support
          community-building work. It is provided as-is, without warranty of any kind.
        </p>
        <p>
          Please use it in a way consistent with the role you’ve been given within your
          cluster, locality, or nucleus.
        </p>
        <p>
          Questions about these terms? Contact: <em>[Michael Kalantar — contact information to be added]</em>
        </p>

        <p className="legal-back-link"><Link href="/">← Back to Nucleus Assistant</Link></p>
      </div>
    </div>
  );
}
