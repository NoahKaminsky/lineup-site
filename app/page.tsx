export default function LineUpMVP() {
  const services = [
    {
      title: "Fresh Fade at Home",
      client: "Noah K.",
      location: "Winnipeg, MB",
      service: "Barber",
      budget: "$35–$50",
      timing: "Tomorrow, 6:00 PM",
      details: "Looking for a clean low taper fade at my place.",
      bids: [
        { name: "Jayden Cuts", price: "$42", type: "At-home", eta: "Tomorrow, 6:15 PM", rating: "4.9" },
        { name: "FadeHouse Studio", price: "$38", type: "In-shop", eta: "Tomorrow, 7:00 PM", rating: "4.8" },
        { name: "CutsByReese", price: "$45", type: "At-home", eta: "Tomorrow, 6:00 PM", rating: "5.0" },
      ],
    },
    {
      title: "Full Set Nails for Event",
      client: "Sarah M.",
      location: "St. Vital",
      service: "Nails",
      budget: "$60–$85",
      timing: "Friday, 4:30 PM",
      details: "Neutral glam set for graduation photos.",
      bids: [
        { name: "GlossedByT", price: "$70", type: "Mobile", eta: "Friday, 4:30 PM", rating: "5.0" },
        { name: "Studio Polished", price: "$62", type: "In-shop", eta: "Friday, 5:00 PM", rating: "4.7" },
      ],
    },
    {
      title: "Last-Minute Chair Opening",
      client: "Downtown Studio",
      location: "Downtown Winnipeg",
      service: "Salon Slot",
      budget: "20% off",
      timing: "Today, 2:30 PM",
      details: "Open barber chair available due to cancellation.",
      bids: [
        { name: "Open Slot Promo", price: "20% off", type: "In-shop", eta: "Today, 2:30 PM", rating: "4.9" },
      ],
    },
  ];

  const pros = [
    {
      name: "Jayden Cuts",
      role: "Barber",
      rating: "4.9",
      jobs: "182 jobs",
      tags: ["At-home", "Shop", "Weekends"],
      bio: "Specializes in fades, tapers, beard lineups, and student cuts.",
      price: "$45 starting",
    },
    {
      name: "LashByMia",
      role: "Lash Artist",
      rating: "4.8",
      jobs: "96 jobs",
      tags: ["Mobile", "Home studio"],
      bio: "Classic and hybrid sets with a strong repeat-client base.",
      price: "$95 starting",
    },
    {
      name: "GlossedByT",
      role: "Nail Tech",
      rating: "5.0",
      jobs: "121 jobs",
      tags: ["Events", "Mobile", "New clients"],
      bio: "Custom nail sets and soft gel manicures for events and everyday wear.",
      price: "$65 starting",
    },
  ];

  const stats = [
    { label: "Service categories", value: "Barber • Nails • Lashes • Brows • Hair" },
    { label: "Ways to book", value: "At home, in-shop, or pro home studio" },
    { label: "Platform model", value: "Client posts request • pros bid • client chooses" },
  ];

  const previewStyles = [
    { category: "Hair", style: "Low Taper Fade", fit: "Sharp and clean around the ears and neckline" },
    { category: "Brows", style: "Soft Defined Brows", fit: "Natural shape with stronger definition" },
    { category: "Nails", style: "Neutral Gloss Set", fit: "Simple polished look for events or everyday" },
    { category: "Lashes", style: "Hybrid Lash Set", fit: "Balanced fullness without looking too dramatic" },
  ];

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-900 text-white font-bold">L</div>
            <div>
              <div className="text-lg font-semibold">LineUp</div>
              <div className="text-xs text-neutral-500">On-demand beauty marketplace</div>
            </div>
          </div>
          <nav className="hidden gap-6 text-sm md:flex">
            <a href="#how" className="hover:text-neutral-600">How it works</a>
            <a href="#preview" className="hover:text-neutral-600">AI preview</a>
            <a href="#requests" className="hover:text-neutral-600">Requests</a>
            <a href="#pros" className="hover:text-neutral-600">Professionals</a>
            <a href="#join" className="hover:text-neutral-600">Join waitlist</a>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-10 px-6 py-16 lg:grid-cols-2 lg:py-24">
          <div className="flex flex-col justify-center">
            <div className="mb-4 inline-flex w-fit items-center rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-600 shadow-sm">
              Winnipeg-based • Built for at-home, in-shop, and flexible beauty services
            </div>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Book beauty services the way people actually want to buy them.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-neutral-600 sm:text-lg">
              Clients post what they need. Barbers, nail techs, lash artists, and other professionals bid on the job. LineUp helps customers compare price, quality, and availability while giving professionals a better way to win new clients.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#join" className="rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:opacity-90">
                Join the waitlist
              </a>
              <a href="#requests" className="rounded-2xl border border-neutral-300 bg-white px-5 py-3 text-sm font-medium text-neutral-800 shadow-sm transition hover:bg-neutral-100">
                View live request demo
              </a>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{stat.label}</div>
                  <div className="mt-2 text-sm font-medium leading-6 text-neutral-800">{stat.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-neutral-200 bg-white p-5 shadow-xl">
            <div className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Post a service request</div>
                  <div className="text-xs text-neutral-500">MVP preview</div>
                </div>
                <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">Live concept</div>
              </div>
              <div className="grid gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">Service needed</label>
                  <input className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm outline-none ring-0" defaultValue="Haircut at home" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-600">Location</label>
                    <input className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm" defaultValue="South Winnipeg" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-600">Budget</label>
                    <input className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm" defaultValue="$40–$50" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-600">Appointment style</label>
                    <select className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm">
                      <option>At home</option>
                      <option>In shop</option>
                      <option>Professional's home studio</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-600">Preferred time</label>
                    <input className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm" defaultValue="Tomorrow at 6:00 PM" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">What are you looking for?</label>
                  <textarea className="min-h-28 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm" defaultValue="Looking for a taper fade and beard cleanup. Want someone experienced and available after work." />
                </div>
                <button className="rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white">Submit request</button>
              </div>
            </div>
          </div>
        </section>

        <section id="preview" className="border-y border-neutral-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-16">
            <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <div className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 w-fit">
                  AI style preview concept
                </div>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight">See different styles before you book</h2>
                <p className="mt-3 max-w-2xl text-neutral-600 leading-7">
                  One of LineUp’s strongest differentiators is reducing uncertainty. Clients can upload a photo and preview different haircut, nail, brow, or lash styles before professionals bid on the job.
                </p>

                <div className="mt-8 grid gap-4 sm:grid-cols-2">
                  {previewStyles.map((item) => (
                    <div key={item.style} className="rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-5 shadow-sm">
                      <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">{item.category}</div>
                      <div className="mt-2 text-lg font-semibold">{item.style}</div>
                      <p className="mt-2 text-sm leading-6 text-neutral-600">{item.fit}</p>
                      <button className="mt-4 rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800">
                        Preview style
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-5 shadow-sm">
                <div className="rounded-[1.5rem] border border-dashed border-neutral-300 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">AI preview mockup</div>
                      <div className="text-xs text-neutral-500">Pre-booking confidence layer</div>
                    </div>
                    <div className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white">Beta</div>
                  </div>
                  <div className="mt-5 grid gap-4">
                    <div className="flex min-h-64 items-center justify-center rounded-[1.5rem] border border-neutral-200 bg-gradient-to-br from-neutral-100 to-neutral-200 text-center text-sm text-neutral-500">
                      Customer photo upload area<br />
                      Style overlays would render here
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-neutral-600">Category</label>
                        <select className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm">
                          <option>Haircut</option>
                          <option>Nails</option>
                          <option>Lashes</option>
                          <option>Brows</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-neutral-600">Style</label>
                        <select className="w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm">
                          <option>Low Taper Fade</option>
                          <option>Mid Fade</option>
                          <option>Neutral Gloss Set</option>
                          <option>Hybrid Lash Set</option>
                        </select>
                      </div>
                    </div>
                    <button className="rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white">Generate preview</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how" className="border-b border-neutral-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-16">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight">How LineUp works</h2>
              <p className="mt-3 text-neutral-600">
                Built to reduce the fear and friction in beauty services for both customers and professionals.
              </p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Client posts a request",
                  body: "Upload a photo, choose the service, set your location, and decide whether you want the service at home, in-shop, or at the professional’s home studio."
                },
                {
                  step: "02",
                  title: "Professionals bid",
                  body: "Barbers, nail techs, lash artists, and salons can respond with prices, availability, and portfolio proof to win the client."
                },
                {
                  step: "03",
                  title: "Client chooses confidently",
                  body: "Compare reviews, ratings, pictures, and pricing in one place instead of relying only on Instagram or word-of-mouth."
                }
              ].map((item) => (
                <div key={item.step} className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6 shadow-sm">
                  <div className="text-sm font-semibold text-neutral-400">{item.step}</div>
                  <h3 className="mt-3 text-xl font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-neutral-600">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="requests" className="mx-auto max-w-7xl px-6 py-16">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Example service requests and bids</h2>
              <p className="mt-2 text-neutral-600">A simple demo of how demand and bidding appear inside the marketplace.</p>
            </div>
            <div className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-600">Customer-side marketplace feed</div>
          </div>
          <div className="mt-8 grid gap-5 xl:grid-cols-3">
            {services.map((item) => (
              <div key={item.title} className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm text-neutral-500">Posted by {item.client}</p>
                  </div>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">{item.service}</span>
                </div>
                <div className="mt-5 space-y-2 text-sm text-neutral-600">
                  <p><span className="font-medium text-neutral-800">Location:</span> {item.location}</p>
                  <p><span className="font-medium text-neutral-800">Budget:</span> {item.budget}</p>
                  <p><span className="font-medium text-neutral-800">Timing:</span> {item.timing}</p>
                  <p><span className="font-medium text-neutral-800">Details:</span> {item.details}</p>
                </div>
                <div className="mt-6 rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-4">
                  <div className="mb-3 text-sm font-semibold">Live bids</div>
                  <div className="space-y-3">
                    {item.bids.map((bid) => (
                      <div key={`${item.title}-${bid.name}`} className="rounded-2xl border border-neutral-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold">{bid.name}</div>
                            <div className="text-xs text-neutral-500">{bid.type} • ⭐ {bid.rating}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-neutral-900">{bid.price}</div>
                            <div className="text-xs text-neutral-500">{bid.eta}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button className="rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white">Choose bid</button>
                    <button className="rounded-2xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700">Message</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="pros" className="border-y border-neutral-200 bg-white">
          <div className="mx-auto max-w-7xl px-6 py-16">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight">Featured professionals</h2>
                <p className="mt-2 text-neutral-600">Profiles are built to help new and growing professionals earn trust faster.</p>
              </div>
              <div className="rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1 text-xs font-medium text-neutral-600">Portfolio + reviews + flexible booking</div>
            </div>
            <div className="mt-8 grid gap-5 lg:grid-cols-3">
              {pros.map((pro) => (
                <div key={pro.name} className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{pro.name}</h3>
                      <p className="text-sm text-neutral-500">{pro.role}</p>
                    </div>
                    <div className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-neutral-800">⭐ {pro.rating}</div>
                  </div>
                  <p className="mt-4 text-sm leading-7 text-neutral-600">{pro.bio}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {pro.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700">{tag}</span>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-neutral-200 pt-4 text-sm">
                    <span className="text-neutral-500">{pro.jobs}</span>
                    <span className="font-semibold text-neutral-900">{pro.price}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
              <div className="text-sm font-semibold text-neutral-500">Professional signup flow</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">Join as a barber, nail tech, lash artist, or salon</h2>
              <p className="mt-3 text-sm leading-7 text-neutral-600">
                This flow is designed to capture supply early, especially new professionals, cosmetology students, and technicians looking to build extra income on evenings or weekends.
              </p>
              <div className="mt-6 grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-600">Full name</label>
                    <input className="w-full rounded-2xl border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm" placeholder="Enter your name" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-600">Primary role</label>
                    <select className="w-full rounded-2xl border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm">
                      <option>Barber</option>
                      <option>Nail tech</option>
                      <option>Lash artist</option>
                      <option>Brow specialist</option>
                      <option>Salon / shop</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-600">Where do you work?</label>
                    <select className="w-full rounded-2xl border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm">
                      <option>I work independently</option>
                      <option>I work in a shop and want extra clients</option>
                      <option>I run a salon or studio</option>
                      <option>I am still in school / training</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-600">Service format</label>
                    <select className="w-full rounded-2xl border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm">
                      <option>At-home</option>
                      <option>In-shop</option>
                      <option>Home studio</option>
                      <option>All of the above</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">Instagram / portfolio link</label>
                  <input className="w-full rounded-2xl border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm" placeholder="@yourhandle or website" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">Why do you want to join LineUp?</label>
                  <textarea className="min-h-28 w-full rounded-2xl border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm" placeholder="Build clientele, fill empty slots, offer mobile services, grow weekend income..." />
                </div>
                <button className="rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white">Apply as a professional</button>
              </div>
            </div>

            <div className="rounded-[2rem] border border-neutral-200 bg-neutral-900 p-8 text-white shadow-sm">
              <div className="text-sm font-semibold text-white/60">Why professionals join</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">A better way to build a client base</h2>
              <ul className="mt-6 space-y-4 text-sm leading-7 text-white/80">
                <li>Win new clients without relying only on Instagram and word-of-mouth.</li>
                <li>Offer extra appointments on evenings and weekends, even if you already work in a shop.</li>
                <li>Provide at-home services, work from your home studio, or fill spare time in an existing salon schedule.</li>
                <li>Build trust quickly through reviews, ratings, and a visual portfolio of past work.</li>
                <li>Give new technicians a lower-friction way to enter the market and earn credibility.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-16">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[2rem] border border-neutral-200 bg-neutral-900 p-8 text-white shadow-sm">
              <div className="text-sm font-semibold text-white/60">Why customers stay</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">Confidence, convenience, and choice</h2>
              <ul className="mt-6 space-y-4 text-sm leading-7 text-white/80">
                <li>Compare multiple offers instead of messaging different accounts manually.</li>
                <li>See who can come to you, who has a shop opening, and who matches your style and budget.</li>
                <li>Reduce uncertainty with transparent portfolios, ratings, and service history.</li>
                <li>Perfect for busy schedules, events, weekends, and last-minute openings.</li>
              </ul>
            </div>
            <div className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
              <div className="text-sm font-semibold text-neutral-500">Pre-launch waitlist</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">Capture early signups before launch</h2>
              <p className="mt-3 text-sm leading-7 text-neutral-600">
                Use this page to collect interest from customers, beauty professionals, and salons before building the full marketplace.
              </p>
              <div className="mt-6 grid gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">I am a...</label>
                  <select className="w-full rounded-2xl border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm">
                    <option>Customer</option>
                    <option>Barber</option>
                    <option>Nail tech</option>
                    <option>Lash artist</option>
                    <option>Salon owner / studio</option>
                    <option>Cosmetology student</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">Email address</label>
                  <input type="email" placeholder="Enter your email" className="w-full rounded-2xl border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-neutral-600">City</label>
                  <input placeholder="Winnipeg" className="w-full rounded-2xl border border-neutral-300 bg-neutral-50 px-4 py-3 text-sm" />
                </div>
                <button className="rounded-2xl bg-neutral-900 px-5 py-3 text-sm font-medium text-white">Join waitlist</button>
                <div className="text-xs text-neutral-500">
                  For demo purposes only — next step would be connecting this to a real form, auth, database, and email tool.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="join" className="border-t border-neutral-200 bg-white">
          <div className="mx-auto max-w-4xl px-6 py-16 text-center">
            <div className="mx-auto max-w-2xl rounded-[2rem] border border-neutral-200 bg-neutral-50 p-8 shadow-sm">
              <div className="text-sm font-semibold text-neutral-500">Launch LineUp in Winnipeg</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">Built for a real MVP path</h2>
              <p className="mt-3 text-neutral-600">
                This prototype now includes the customer request flow, AI style preview concept, professional onboarding flow, bidding interface, and pre-launch waitlist structure.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm text-neutral-600">
                <span className="rounded-full border border-neutral-300 bg-white px-4 py-2">AI preview mockup</span>
                <span className="rounded-full border border-neutral-300 bg-white px-4 py-2">Pro signup flow</span>
                <span className="rounded-full border border-neutral-300 bg-white px-4 py-2">Bidding marketplace</span>
                <span className="rounded-full border border-neutral-300 bg-white px-4 py-2">Waitlist capture</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

