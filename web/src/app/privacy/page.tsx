import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — Nucleus Assistant',
};

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-page-body">
        <h1>Privacy Policy</h1>
        <p>
          Nucleus Assistant is a tool for Bahá’í community-building workers to view and
          update information about nuclei (neighbourhoods, networks, and population
          groups) within a cluster. This policy explains what information it holds,
          where that information comes from, and who can see it.
        </p>

        <h2>What information we hold</h2>
        <ul>
          <li>People’s names</li>
          <li>Sex and age category</li>
          <li>Where people are placed — their cluster, locality, and neighbourhood (nucleus)</li>
          <li>Roles people hold in a nucleus (such as accompanier, promoter, or contact)</li>
          <li>Records of community-building activities and participant counts</li>
          <li>Neighbourhood-level counts (such as population and participation estimates)</li>
          <li>Free-text narratives written by nucleus contacts</li>
        </ul>

        <h2>Where this information comes from</h2>
        <p>
          Most of this information is collected from participants in community building activities.
        </p>

        <h2>Where this information is stored</h2>
        <ul>
          <li>The underlying database and API run on Render, hosted in the United States (Virginia region).</li>
          <li>The Nucleus Assistant application itself is hosted on Vercel.</li>
          <li>Signing in is handled by Clerk, which supports signing in with Google or email.</li>
        </ul>

        <h2>Who can see what</h2>
        <p>
          Access is based on each person’s role. A person sees the information their
          role covers, within their cluster, locality, or nucleus. Personal fields —
          sex, age, address, email, and phone — are checked individually, field by
          field, before being shown. Everyone can see and update their own record.
        </p>

        <h2>What we don’t do</h2>
        <p>
          We do not sell personal information. We do not use it for advertising. We do
          not track visitors beyond what’s needed to sign in.
        </p>

        <h2>Your rights</h2>
        <p>
          If you’d like to access, correct, or ask us to remove your information,
          contact: <em>[Michael Kalantar — contact information to be added]</em>
        </p>

        <h2>Changes to this policy</h2>
        <p>
          We may update this policy as the tool changes.
        </p>

        <p className="legal-back-link"><Link href="/">← Back to Nucleus Assistant</Link></p>
      </div>
    </div>
  );
}
