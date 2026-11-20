import { ArrowLeft, ShieldCheck } from 'lucide-react';

interface PrivacyPolicyViewProps {
  onBack: () => void;
}

export function PrivacyPolicyView({ onBack }: PrivacyPolicyViewProps) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 min-h-[40px] text-sm font-medium text-[#475569] hover:text-[#0F172A] cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Explore</span>
      </button>

      <article className="bg-white border border-[#E2E8F0] rounded-2xl p-6 sm:p-8 space-y-6 shadow-xs">
        <header className="space-y-2 pb-5 border-b border-[#E2E8F0]">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#4F46E5]">
            <ShieldCheck className="w-4 h-4" />
            <span>TripFolio Privacy &amp; Permissions Notice</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#0F172A]">
            Privacy Policy
          </h1>
          <p className="text-xs text-[#475569]">
            Applies to TripFolio web and Android experiences.
          </p>
        </header>

        <section className="space-y-2 text-sm text-[#334155] leading-relaxed">
          <h2 className="text-base font-semibold text-[#0F172A]">1. Account Information</h2>
          <p>
            When you sign in with Google, TripFolio receives your basic account identifier,
            display name, and profile avatar to create your public explorer profile. Your email
            address is used solely for authentication and is not published on public trip cards or
            leaderboards.
          </p>
        </section>

        <section className="space-y-2 text-sm text-[#334155] leading-relaxed">
          <h2 className="text-base font-semibold text-[#0F172A]">2. Location &amp; GPS Data</h2>
          <p>
            TripFolio requests device location permission only when you tap{' '}
            <strong className="text-[#0F172A]">Use GPS</strong> or{' '}
            <strong className="text-[#0F172A]">Current GPS</strong> to pin a starting point or
            reached waypoint. Location coordinates and elevations are stored only for trips you
            create. Trips marked <strong className="text-[#0F172A]">Private</strong> remain visible
            only to you.
          </p>
        </section>

        <section className="space-y-2 text-sm text-[#334155] leading-relaxed">
          <h2 className="text-base font-semibold text-[#0F172A]">3. Camera &amp; Photos</h2>
          <p>
            Camera access is requested only when you choose to take a snap inside the trip logging
            workflow. Uploaded and captured images are compressed on-device and attached to the
            selected stop or trip cover.
          </p>
        </section>

        <section className="space-y-2 text-sm text-[#334155] leading-relaxed">
          <h2 className="text-base font-semibold text-[#0F172A]">4. Third-Party Services</h2>
          <p>
            TripFolio uses Google Firebase Authentication and Cloud Firestore for account sign-in
            and trip storage, Google Maps Platform for interactive mapping and place search, and
            Open-Meteo APIs to retrieve elevation and weather previews for pinned coordinates.
          </p>
        </section>

        <section className="space-y-2 text-sm text-[#334155] leading-relaxed">
          <h2 className="text-base font-semibold text-[#0F172A]">
            5. Data Control &amp; Account Deletion
          </h2>
          <p>
            You can switch any trip between Public and Private, delete individual trips or stops at
            any time, or permanently delete your account and all stored trips directly from{' '}
            <strong className="text-[#0F172A]">Profile &rarr; Profile Details &rarr; Delete Account</strong>.
          </p>
        </section>
      </article>
    </div>
  );
}
