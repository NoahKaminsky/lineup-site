"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const serviceDetailOptions: Record<string, string[]> = {
  haircut: [
    "Haircut",
    "Skin fade",
    "Taper / taper fade",
    "Buzz cut",
    "Beard trim",
    "Line up / shape up",
    "Other",
  ],
  nails: [
    "Manicure",
    "Pedicure",
    "Acrylic full set",
    "Acrylic fill",
    "Gel manicure",
    "Gel X / extensions",
    "Nail art",
    "Other",
  ],
  lashes: [
    "Classic set",
    "Hybrid set",
    "Volume set",
    "Fill",
    "Lash lift",
    "Lash tint",
    "Other",
  ],
  brows: [
    "Brow shaping",
    "Brow wax",
    "Brow tint",
    "Brow lamination",
    "Threading",
    "Other",
  ],
  makeup: [
    "Full face",
    "Soft glam",
    "Full glam",
    "Bridal makeup",
    "Event makeup",
    "Makeup lesson",
    "Other",
  ],
};

export default function NewRequestPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const [category, setCategory] = useState("");
  const [serviceDetail, setServiceDetail] = useState("");
  const [otherServiceDetail, setOtherServiceDetail] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [serviceMode, setServiceMode] = useState("");
  const [budget, setBudget] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadUser() {
      setMessage("Loading user...");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError) {
        setMessage(profileError.message);
        setLoading(false);
        return;
      }

      const isCustomer =
        profile?.role === "customer" || profile?.role === "I am a customer";

      if (!isCustomer) {
        setMessage("Only customers can post requests.");
        setLoading(false);
        return;
      }

      setUserId(user.id);
      setMessage("");
      setLoading(false);
    }

    loadUser();
  }, [router]);

  function getTargetProfessions(category: string) {
    switch (category) {
      case "haircut":
        return ["barber", "hairstylist"];
      case "nails":
        return ["nail_artist"];
      case "lashes":
        return ["lash_artist"];
      case "brows":
        return ["brow_artist"];
      case "makeup":
        return ["makeup_artist"];
      default:
        return [];
    }
  }

  function handleCategoryChange(value: string) {
    setCategory(value);
    setServiceDetail("");
    setOtherServiceDetail("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (submitting) return;

    if (!userId) {
      setMessage("No user found.");
      return;
    }

    if (!category) {
      setMessage("Please select a service.");
      return;
    }

    if (!serviceDetail) {
      setMessage("Please select a service type.");
      return;
    }

    if (serviceDetail === "Other" && !otherServiceDetail.trim()) {
      setMessage("Please describe the service type.");
      return;
    }

    if (!title.trim()) {
      setMessage("Please enter a title.");
      return;
    }

    setSubmitting(true);
    setMessage("Submitting request...");

    const targetProfessions = getTargetProfessions(category);

    const finalServiceDetail =
      serviceDetail === "Other" ? otherServiceDetail.trim() : serviceDetail;

    const { data, error } = await supabase
      .from("service_requests")
      .insert([
        {
          client_id: userId,
          category,
          service_detail: finalServiceDetail || null,
          title: title.trim(),
          description: description.trim() || null,
          location: location.trim() || null,
          service_mode: serviceMode || null,
          budget: budget.trim() || null,
          status: "open",
          target_professions: targetProfessions,
        },
      ])
      .select();

    if (error) {
      console.error("INSERT ERROR:", error);
      setMessage(error.message);
      setSubmitting(false);
      return;
    }

    console.log("INSERT SUCCESS:", data);
    setMessage("Request posted successfully.");
    router.push("/requests");
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl p-10">
        <p>Loading...</p>
        {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-10">
      <h1 className="mb-6 text-3xl font-semibold">Create a request</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-medium">Service</label>
          <select
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="w-full rounded border p-3"
          >
            <option value="">Select service</option>
            <option value="haircut">Haircut</option>
            <option value="nails">Nails</option>
            <option value="lashes">Lashes</option>
            <option value="brows">Brows</option>
            <option value="makeup">Makeup</option>
          </select>
        </div>

        {category && (
          <div>
            <label className="mb-2 block text-sm font-medium">Service type</label>
            <select
              value={serviceDetail}
              onChange={(e) => {
                setServiceDetail(e.target.value);
                if (e.target.value !== "Other") {
                  setOtherServiceDetail("");
                }
              }}
              className="w-full rounded border p-3"
            >
              <option value="">Select service type</option>
              {serviceDetailOptions[category]?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        )}

        {serviceDetail === "Other" && (
          <div>
            <label className="mb-2 block text-sm font-medium">
              Describe the service type
            </label>
            <input
              type="text"
              placeholder="Type the service you want"
              value={otherServiceDetail}
              onChange={(e) => setOtherServiceDetail(e.target.value)}
              className="w-full rounded border p-3"
            />
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium">Title</label>
          <input
            type="text"
            placeholder="Need a gel manicure this weekend"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border p-3"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            Extra details
          </label>
          <textarea
            placeholder="Describe what you want..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded border p-3"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Location</label>
          <input
            type="text"
            placeholder="Winnipeg, MB"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full rounded border p-3"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Service mode</label>
          <select
            value={serviceMode}
            onChange={(e) => setServiceMode(e.target.value)}
            className="w-full rounded border p-3"
          >
            <option value="">Select mode</option>
            <option value="in_shop">In shop</option>
            <option value="at_home">At home</option>
            <option value="home_studio">Home studio</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Budget</label>
          <input
            type="text"
            placeholder="$40-60"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="w-full rounded border p-3"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded bg-black py-3 text-white disabled:opacity-60"
          disabled={submitting}
        >
          {submitting ? "Posting..." : "Post request"}
        </button>

        {message ? <p className="text-sm text-red-600">{message}</p> : null}
      </form>
    </main>
  );
}