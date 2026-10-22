import type { Metadata } from "next";
import PublicLayout, { PageIntro } from "@/app/components/site/PublicLayout";
import FounderCards from "@/app/components/landing/FounderCards";

export const metadata: Metadata = {
  title: "About LineUp | Meet the founders",
  description:
    "LineUp was founded in Winnipeg by Noah Kaminsky and Dan Latimer to make finding and booking a trusted beauty or grooming pro simple.",
};

export default function AboutPage() {
  return (
    <PublicLayout>
      <PageIntro
        eyebrow="About"
        title={
          <>
            Built in Winnipeg.
            <span className="block text-neutral-400">Because nobody deserves a clapped haircut.</span>
          </>
        }
      />

      <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-24 sm:px-6 lg:grid-cols-12 lg:gap-16">
        <div className="order-2 space-y-5 text-base leading-8 text-neutral-600 lg:order-1 lg:col-span-6">
          <p className="lu-rise-in" style={{ animationDelay: "260ms" }}>
            LineUp was founded in Winnipeg by Noah Kaminsky and Dan Latimer, from the University of Manitoba, with
            backgrounds in agribusiness and design.
          </p>
          <p className="lu-rise-in" style={{ animationDelay: "320ms" }}>
            Beauty and grooming is a fragmented industry. The best people are spread across shops, shared spaces and
            home studios, and finding them usually means scrolling and messaging. We built LineUp so clients can ask
            once, see real work, and book a time that actually works, and so pros can fill their calendar without
            living in their inbox.
          </p>
          <p className="lu-rise-in" style={{ animationDelay: "380ms" }}>
            Every pro on LineUp is verified before they can be booked, and payments go through the app, so both sides
            are covered.
          </p>

          <figure className="lu-rise-in mt-10 rounded-3xl bg-white p-6 ring-1 ring-ink/[0.07] sm:p-8" style={{ animationDelay: "440ms" }}>
            <p className="text-xs font-medium text-neutral-500">Our mission</p>
            <blockquote className="mt-3 text-[1.5rem] font-semibold leading-[1.15] tracking-[-0.03em] text-ink sm:text-[1.75rem]">
              To redefine how people experience aesthetics by putting the individual at the center of everything.
            </blockquote>
          </figure>

          <p className="lu-rise-in pt-4 text-sm text-neutral-500" style={{ animationDelay: "500ms" }}>
            Launching first across Canada.
          </p>
        </div>

        <div className="order-1 lg:order-2 lg:col-span-5 lg:col-start-8">
          <p className="mb-4 text-xs font-medium text-neutral-500">The founders</p>
          <FounderCards />
        </div>
      </section>
    </PublicLayout>
  );
}
