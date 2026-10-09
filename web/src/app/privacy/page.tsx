import Link from 'next/link';

// Draft, 2026-10-09 -- written from facts Michael gave us (via cluster-notebook)
// so this URL exists before Google will publish the production OAuth consent
// screen. Wording is NOT final: Michael reviews and edits before this is real
// policy (see the notice below, which stays until he removes it). Public on
// purpose -- no auth() check here, same as /terms, since Google needs to reach
// both while signed out.
export const metadata = {
  title: 'Privacy Policy — Nucleus Assistant',
};

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-page-body">
        <p className="legal-draft-notice">
          Draft — last updated October 9, 2026. Pending review by Michael Kalantar; not yet final.
        </p>
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
          <li>
            Phone number and email address fields exist in the system, but are not
            currently filled in from the Statistical Reporting Program.
          </li>
        </ul>

        <h2>Where this information comes from</h2>
        <p>
          Most of this information is read from the Bahá’í Statistical Reporting Program
          (SRP). When someone updates neighbourhood-level counts in Nucleus Assistant,
          those changes are written back to SRP.
        </p>

        <h2>Where this information is stored</h2>
        <ul>
          <li>The underlying database and API run on Render, hosted in the United States (Virginia region).</li>
          <li>The Nucleus Assistant application itself is hosted on Vercel.</li>
          <li>Signing in is handled by Clerk, which supports signing in with Google, GitHub, or email.</li>
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
          We may update this policy as the tool changes. <em>[Placeholder — Michael to revise.]</em>
        </p>

        <p className="legal-back-link"><Link href="/">← Back to Nucleus Assistant</Link></p>
      </div>
    </div>
  );
}
