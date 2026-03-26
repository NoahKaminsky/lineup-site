"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import MarkRequestNotificationRead from "@/app/components/MarkRequestNotificationRead";

type ServiceRequest = {
  id: string;
  client_id: string;
  category: string;
  service_detail: string | null;
  title: string;
  description: string | null;
  location: string | null;
  service_mode: string | null;
  budget: string | null;
  status: "open" | "accepted" | "completion_requested" | "completed" | string;
  target_professions: string[] | null;
  accepted_professional_id: string | null;
  created_at: string;
  reference_photos: string[] | null;
};

type RequestOffer = {
  id: string;
  request_id: string;
  professional_id: string;
  message: string | null;
  proposed_price: string | null;
  status: "pending" | "accepted" | "declined" | string;
  created_at: string;
  viewed_by_customer?: boolean | null;
  customer_response_message?: string | null;
  professional_name: string | null;
  professional_avatar_url: string | null;
  professional_type: string | null;
  average_rating?: number | null;
  review_count?: number;
};

type RequestOwnerProfile = {
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
};

type ExistingReview = {
  id: string;
  request_id: string;
  professional_id: string;
  reviewer_id: string;
  rating: number;
  comment: string | null;
};

type ChatMessage = {
  id: string;
  request_id: string;
  sender_id: string;
  message: string;
  created_at: string;
};

type ChatParticipantProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

export default function RequestDetailPage() {
  const router = useRouter();
  const params = useParams();
  const requestId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [role, setRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [offers, setOffers] = useState<RequestOffer[]>([]);
  const [requestOwner, setRequestOwner] = useState<RequestOwnerProfile | null>(
    null
  );
  const [chatProfiles, setChatProfiles] = useState<
    Record<string, ChatParticipantProfile>
  >({});

  const [hasSubmittedOffer, setHasSubmittedOffer] = useState(false);
  const [unreadOfferIds, setUnreadOfferIds] = useState<string[]>([]);

  const [acceptingOfferId, setAcceptingOfferId] = useState<string | null>(null);
  const [decliningOfferId, setDecliningOfferId] = useState<string | null>(null);
  const [declineMessage, setDeclineMessage] = useState("");
  const [declineLoading, setDeclineLoading] = useState(false);

  const [editingReofferId, setEditingReofferId] = useState<string | null>(null);
  const [reofferMessage, setReofferMessage] = useState("");
  const [reofferPrice, setReofferPrice] = useState("");
  const [reofferLoading, setReofferLoading] = useState(false);

  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newChatMessage, setNewChatMessage] = useState("");
  const [sendingChatMessage, setSendingChatMessage] = useState(false);

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [existingReview, setExistingReview] = useState<ExistingReview | null>(
    null
  );

  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  const isCustomer =
    role === "customer" || role === "I am a customer" || role === "Customer";

  const isProfessional =
    role === "professional" ||
    role === "I am a professional" ||
    role === "Professional";

  const isAcceptedProfessional = useMemo(() => {
    if (!request || !currentUserId) return false;
    return currentUserId === request.accepted_professional_id;
  }, [request, currentUserId]);

  const canAccessChat = useMemo(() => {
    if (!request || !currentUserId || !request.accepted_professional_id) {
      return false;
    }

    return (
      currentUserId === request.client_id ||
      currentUserId === request.accepted_professional_id
    );
  }, [request, currentUserId]);

  const isChatReadOnly = request?.status === "completed";

  function formatCategory(category: string) {
    return category
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function formatMode(mode: string | null) {
    if (!mode) return "Not provided";
    if (mode === "in_shop") return "In shop";
    if (mode === "at_home") return "At home";
    if (mode === "home_studio") return "Home studio";

    return mode.replaceAll("_", " ");
  }

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function formatChatTime(dateString: string) {
    return new Date(dateString).toLocaleString("en-CA", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function getStatusLabel(status: string) {
    if (status === "open") return "Open";
    if (status === "accepted") return "Accepted";
    if (status === "completion_requested") return "Completion requested";
    if (status === "completed") return "Completed";
    return status.replaceAll("_", " ");
  }

  const loadRequestLive = useCallback(async () => {
    if (!requestId) return;

    setLoading(true);
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.push("/login");
      return;
    }

    setCurrentUserId(user.id);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, professional_type")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      setMessage("Could not load profile.");
      setLoading(false);
      return;
    }

    setRole(profile.role);

    const { data: requestData, error: requestError } = await supabase
      .from("service_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (requestError || !requestData) {
      setMessage("Request not found or you do not have access.");
      setLoading(false);
      return;
    }

    setRequest(requestData);

    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, role")
      .eq("id", requestData.client_id)
      .single();

    setRequestOwner(ownerProfile ?? null);

    let offersQuery = supabase
      .from("request_offers")
      .select("*")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false });

    if (profile.role === "professional" || profile.role === "I am a professional") {
      offersQuery = offersQuery.eq("professional_id", user.id);
    }

    const { data: offersData, error: offersError } = await offersQuery;

    let enrichedOffers: RequestOffer[] = [];

    if (!offersError && offersData) {
      const alreadyOffered = offersData.some(
        (offer) =>
          offer.professional_id === user.id &&
          (offer.status === "pending" || offer.status === "accepted")
      );

      setHasSubmittedOffer(alreadyOffered);

      const professionalIds = [
        ...new Set(offersData.map((offer) => offer.professional_id)),
      ];

      let profilesMap = new Map<
        string,
        {
          full_name: string | null;
          avatar_url: string | null;
          professional_type: string | null;
        }
      >();

      let ratingsMap = new Map<
        string,
        {
          average_rating: number | null;
          review_count: number;
        }
      >();

      if (professionalIds.length > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url, professional_type")
          .in("id", professionalIds);

        if (profileData) {
          profilesMap = new Map(
            profileData.map((profileRow) => [
              profileRow.id,
              {
                full_name: profileRow.full_name ?? null,
                avatar_url: profileRow.avatar_url ?? null,
                professional_type: profileRow.professional_type ?? null,
              },
            ])
          );
        }

        const { data: reviewsData } = await supabase
          .from("professional_reviews")
          .select("professional_id, rating")
          .in("professional_id", professionalIds);

        if (reviewsData) {
          const grouped = new Map<string, number[]>();

          for (const review of reviewsData) {
            const existing = grouped.get(review.professional_id) ?? [];
            existing.push(Number(review.rating));
            grouped.set(review.professional_id, existing);
          }

          ratingsMap = new Map(
            Array.from(grouped.entries()).map(([professionalId, ratings]) => {
              const total = ratings.reduce((sum, value) => sum + value, 0);
              const avg = ratings.length ? total / ratings.length : null;

              return [
                professionalId,
                {
                  average_rating: avg,
                  review_count: ratings.length,
                },
              ];
            })
          );
        }
      }

      enrichedOffers = offersData.map((offer) => {
        const pro = profilesMap.get(offer.professional_id);
        const ratingData = ratingsMap.get(offer.professional_id);

        return {
          ...offer,
          professional_name: pro?.full_name ?? null,
          professional_avatar_url: pro?.avatar_url ?? null,
          professional_type: pro?.professional_type ?? null,
          average_rating: ratingData?.average_rating ?? null,
          review_count: ratingData?.review_count ?? 0,
        };
      });

      setOffers(enrichedOffers);

      if (profile.role === "customer" || profile.role === "I am a customer") {
        const ids = offersData
          .filter((offer) => !offer.viewed_by_customer)
          .map((offer) => offer.id);

        setUnreadOfferIds(ids);

        await supabase
          .from("request_offers")
          .update({ viewed_by_customer: true })
          .eq("request_id", requestId)
          .eq("viewed_by_customer", false);
      } else {
        setUnreadOfferIds([]);
      }
    } else {
      setOffers([]);
      setHasSubmittedOffer(false);
      setUnreadOfferIds([]);
    }

    const acceptedOffer = enrichedOffers.find((offer) => offer.status === "accepted");

    if (
      requestData.status === "completed" &&
      (profile.role === "customer" || profile.role === "I am a customer") &&
      acceptedOffer
    ) {
      const { data: existingReviewData } = await supabase
        .from("professional_reviews")
        .select("id, request_id, professional_id, reviewer_id, rating, comment")
        .eq("request_id", requestData.id)
        .eq("reviewer_id", user.id)
        .maybeSingle();

      if (existingReviewData) {
        setExistingReview(existingReviewData);
        setReviewRating(existingReviewData.rating);
        setReviewComment(existingReviewData.comment ?? "");
      } else {
        setExistingReview(null);
        setReviewRating(5);
        setReviewComment("");
      }
    } else {
      setExistingReview(null);
    }

    const canAccessChatNow =
      !!requestData.accepted_professional_id &&
      (user.id === requestData.client_id ||
        user.id === requestData.accepted_professional_id);

    if (canAccessChatNow) {
      const { data: messagesData, error: messagesError } = await supabase
        .from("request_messages")
        .select("id, request_id, sender_id, message, created_at")
        .eq("request_id", requestId)
        .order("created_at", { ascending: true });

      if (!messagesError && messagesData) {
        setChatMessages(messagesData);

        const senderIds = [...new Set(messagesData.map((msg) => msg.sender_id))];
        if (senderIds.length > 0) {
          const { data: senderProfiles } = await supabase
            .from("profiles")
            .select("id, full_name, avatar_url")
            .in("id", senderIds);

          if (senderProfiles) {
            const profileMap: Record<string, ChatParticipantProfile> = {};
            senderProfiles.forEach((p) => {
              profileMap[p.id] = {
                id: p.id,
                full_name: p.full_name ?? null,
                avatar_url: p.avatar_url ?? null,
              };
            });
            setChatProfiles(profileMap);
          }
        }
      } else {
        setChatMessages([]);
        setChatProfiles({});
      }
    } else {
      setChatMessages([]);
      setChatProfiles({});
    }

    setLoading(false);
  }, [requestId, router]);

  useEffect(() => {
    loadRequestLive();
  }, [loadRequestLive]);

  useEffect(() => {
    if (!requestId) return;

    const channel = supabase
      .channel(`request-detail-live-${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_requests",
          filter: `id=eq.${requestId}`,
        },
        async () => {
          await loadRequestLive();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "request_offers",
          filter: `request_id=eq.${requestId}`,
        },
        async () => {
          await loadRequestLive();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestId, loadRequestLive]);

  useEffect(() => {
    if (!requestId || !currentUserId || !request?.accepted_professional_id) return;

    const canAccessCurrentChat =
      currentUserId === request.client_id ||
      currentUserId === request.accepted_professional_id;

    if (!canAccessCurrentChat) return;

    const channel = supabase
      .channel(`request-messages-${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "request_messages",
          filter: `request_id=eq.${requestId}`,
        },
        async (payload) => {
          const incoming = payload.new as ChatMessage;

          setChatMessages((prev) => {
            if (prev.some((msg) => msg.id === incoming.id)) return prev;
            return [...prev, incoming];
          });

          if (!chatProfiles[incoming.sender_id]) {
            const { data: senderProfile } = await supabase
              .from("profiles")
              .select("id, full_name, avatar_url")
              .eq("id", incoming.sender_id)
              .single();

            if (senderProfile) {
              setChatProfiles((prev) => ({
                ...prev,
                [senderProfile.id]: {
                  id: senderProfile.id,
                  full_name: senderProfile.full_name ?? null,
                  avatar_url: senderProfile.avatar_url ?? null,
                },
              }));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [
    requestId,
    currentUserId,
    request?.accepted_professional_id,
    request?.client_id,
    chatProfiles,
  ]);

  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages]);

  async function handleAcceptOffer(offerId: string) {
    if (!request || !isCustomer || request.status !== "open") return;

    setMessage("");
    setAcceptingOfferId(offerId);

    const acceptedOffer = offers.find((offer) => offer.id === offerId);

    if (!acceptedOffer) {
      setMessage("Offer not found.");
      setAcceptingOfferId(null);
      return;
    }

    const { error: acceptSelectedError } = await supabase
      .from("request_offers")
      .update({ status: "accepted" })
      .eq("id", offerId)
      .eq("request_id", request.id);

    if (acceptSelectedError) {
      setMessage(acceptSelectedError.message);
      setAcceptingOfferId(null);
      return;
    }

    const otherOfferIds = offers
      .filter((offer) => offer.id !== offerId)
      .map((offer) => offer.id);

    if (otherOfferIds.length > 0) {
      const { error: declineOthersError } = await supabase
        .from("request_offers")
        .update({ status: "declined" })
        .in("id", otherOfferIds);

      if (declineOthersError) {
        setMessage(declineOthersError.message);
        setAcceptingOfferId(null);
        return;
      }
    }

    const { error: updateRequestError } = await supabase
      .from("service_requests")
      .update({
        status: "accepted",
        accepted_professional_id: acceptedOffer.professional_id,
      })
      .eq("id", request.id);

    if (updateRequestError) {
      setMessage(updateRequestError.message);
      setAcceptingOfferId(null);
      return;
    }

    if (currentUserId) {
      await supabase.from("request_messages").insert([
        {
          request_id: request.id,
          sender_id: currentUserId,
          message: "Offer accepted. You can now chat here to coordinate details.",
        },
      ]);
    }

    setOffers((prev) =>
      prev.map((offer) => ({
        ...offer,
        status: offer.id === offerId ? "accepted" : "declined",
      }))
    );

    setRequest((prev) =>
      prev
        ? {
            ...prev,
            status: "accepted",
            accepted_professional_id: acceptedOffer.professional_id,
          }
        : prev
    );

    setAcceptingOfferId(null);
    setMessage("Offer accepted.");
  }

  async function handleDeclineOffer(offerId: string) {
    if (!declineMessage.trim()) {
      setMessage("Please enter a reason for declining this offer.");
      return;
    }

    setMessage("");
    setDeclineLoading(true);

    const { error } = await supabase
      .from("request_offers")
      .update({
        status: "declined",
        customer_response_message: declineMessage.trim(),
      })
      .eq("id", offerId)
      .eq("request_id", requestId);

    if (error) {
      setMessage(error.message);
      setDeclineLoading(false);
      return;
    }

    setOffers((prev) =>
      prev.map((offer) =>
        offer.id === offerId
          ? {
              ...offer,
              status: "declined",
              customer_response_message: declineMessage.trim(),
            }
          : offer
      )
    );

    setDecliningOfferId(null);
    setDeclineMessage("");
    setDeclineLoading(false);
    setMessage("Offer declined.");
  }

  async function handleReoffer(offerId: string) {
    if (!reofferMessage.trim()) {
      setMessage("Please enter an updated offer message.");
      return;
    }

    if (!reofferPrice.trim()) {
      setMessage("Please enter an updated price.");
      return;
    }

    setMessage("");
    setReofferLoading(true);

    const { error } = await supabase
      .from("request_offers")
      .update({
        message: reofferMessage.trim(),
        proposed_price: reofferPrice.trim(),
        status: "pending",
        customer_response_message: null,
        viewed_by_customer: false,
      })
      .eq("id", offerId)
      .eq("request_id", requestId);

    if (error) {
      setMessage(error.message);
      setReofferLoading(false);
      return;
    }

    setOffers((prev) =>
      prev.map((offer) =>
        offer.id === offerId
          ? {
              ...offer,
              message: reofferMessage.trim(),
              proposed_price: reofferPrice.trim(),
              status: "pending",
              customer_response_message: null,
              viewed_by_customer: false,
            }
          : offer
      )
    );

    setEditingReofferId(null);
    setReofferMessage("");
    setReofferPrice("");
    setReofferLoading(false);
    setHasSubmittedOffer(true);
    setMessage("Re-offer submitted.");
  }

  async function handleRequestCompletion() {
    if (!request || !isAcceptedProfessional || request.status !== "accepted") {
      return;
    }

    setMessage("");

    const { error } = await supabase
      .from("service_requests")
      .update({ status: "completion_requested" })
      .eq("id", request.id)
      .eq("accepted_professional_id", currentUserId);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (currentUserId) {
      await supabase.from("request_messages").insert([
        {
          request_id: request.id,
          sender_id: currentUserId,
          message: "Completion requested. Waiting for customer confirmation.",
        },
      ]);
    }

    setRequest((prev) =>
      prev
        ? {
            ...prev,
            status: "completion_requested",
          }
        : prev
    );

    setMessage("Completion request sent. Waiting for customer confirmation.");
  }

  async function handleConfirmCompletion() {
    if (!request || !isCustomer || request.status !== "completion_requested") {
      return;
    }

    setMessage("");

    const { error } = await supabase
      .from("service_requests")
      .update({ status: "completed" })
      .eq("id", request.id)
      .eq("client_id", currentUserId);

    if (error) {
      setMessage(error.message);
      return;
    }

    if (currentUserId) {
      await supabase.from("request_messages").insert([
        {
          request_id: request.id,
          sender_id: currentUserId,
          message: "Service confirmed as completed.",
        },
      ]);
    }

    setRequest((prev) =>
      prev
        ? {
            ...prev,
            status: "completed",
          }
        : prev
    );

    setMessage("Service confirmed as completed.");
  }

  async function handleSubmitReview() {
    if (!request) return;

    const acceptedOffer = offers.find((offer) => offer.status === "accepted");

    if (!acceptedOffer) {
      setMessage("No accepted professional found for this request.");
      return;
    }

    setSubmittingReview(true);
    setMessage("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage("You must be logged in to leave a review.");
      setSubmittingReview(false);
      return;
    }

    const { data, error } = await supabase
      .from("professional_reviews")
      .insert([
        {
          request_id: request.id,
          professional_id: acceptedOffer.professional_id,
          reviewer_id: user.id,
          rating: reviewRating,
          comment: reviewComment.trim() || null,
        },
      ])
      .select("id, request_id, professional_id, reviewer_id, rating, comment")
      .single();

    if (error) {
      setMessage(error.message);
      setSubmittingReview(false);
      return;
    }

    setExistingReview(data);
    setMessage("Review submitted.");
    setSubmittingReview(false);
  }

  async function handleSendChatMessage() {
    if (!request || !currentUserId || !newChatMessage.trim()) return;
    if (!canAccessChat) return;
    if (request.status === "completed") return;

    setSendingChatMessage(true);
    setMessage("");

    const messageToSend = newChatMessage.trim();
    setNewChatMessage("");

    const { error } = await supabase.from("request_messages").insert([
      {
        request_id: request.id,
        sender_id: currentUserId,
        message: messageToSend,
      },
    ]);

    if (error) {
      setMessage(error.message);
      setNewChatMessage(messageToSend);
      setSendingChatMessage(false);
      return;
    }

    setSendingChatMessage(false);
  }

  const acceptedOffer = useMemo(() => {
    return offers.find((offer) => offer.status === "accepted") ?? null;
  }, [offers]);

  if (loading) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
        <div className="mx-auto max-w-5xl py-16">
          <p className="text-neutral-500">Loading request...</p>
        </div>
      </main>
    );
  }

  if (!request) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
        <div className="mx-auto max-w-5xl py-16">
          <Link
            href="/requests"
            className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
          >
            ← Back to requests
          </Link>

          <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
            {message || "Request not found."}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-neutral-900">
      {isProfessional ? (
        <MarkRequestNotificationRead requestId={requestId} />
      ) : null}

      <div className="mx-auto flex max-w-6xl items-center justify-between border-b border-neutral-200 pb-6">
        <Link href="/" className="text-2xl font-semibold tracking-tight">
          LineUp
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href="/requests"
            className="text-sm font-medium text-neutral-500 transition hover:text-neutral-900"
          >
            Back to requests
          </Link>

          <Link
            href="/account"
            className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
          >
            View profile
          </Link>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-8 py-16 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
              {formatCategory(request.category)}
              {request.service_detail ? ` • ${request.service_detail}` : ""}
            </span>

            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
              {getStatusLabel(request.status)}
            </span>
          </div>

          <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-5xl">
            {request.title}
          </h1>

          {requestOwner ? (
            <div className="mt-5 flex items-center gap-3">
              <div className="h-12 w-12 overflow-hidden rounded-full border border-neutral-200 bg-white">
                {requestOwner.avatar_url ? (
                  <img
                    src={requestOwner.avatar_url}
                    alt={requestOwner.full_name || "Customer"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-medium text-neutral-500">
                    {requestOwner.full_name?.charAt(0).toUpperCase() || "C"}
                  </div>
                )}
              </div>

              <div>
                <p className="text-sm text-neutral-500">Posted by</p>
                <p className="font-semibold text-neutral-900">
                  {requestOwner.full_name || "Customer"}
                </p>
              </div>
            </div>
          ) : null}

          {request.description ? (
            <p className="mt-5 max-w-3xl text-lg leading-8 text-neutral-600">
              {request.description}
            </p>
          ) : null}

          {request.reference_photos && request.reference_photos.length > 0 ? (
            <div className="mt-8">
              <h3 className="text-lg font-semibold tracking-tight">
                Reference photos
              </h3>

              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {request.reference_photos.map((photoUrl, index) => (
                  <button
                    key={`${photoUrl}-${index}`}
                    type="button"
                    onClick={() => setSelectedPhoto(photoUrl)}
                    className="overflow-hidden rounded-2xl border border-neutral-200 transition hover:opacity-90"
                  >
                    <img
                      src={photoUrl}
                      alt={`Reference ${index + 1}`}
                      className="h-40 w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-neutral-200 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Location
              </p>
              <p className="mt-2 text-sm font-medium text-neutral-900">
                {request.location || "Not provided"}
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Service mode
              </p>
              <p className="mt-2 text-sm font-medium text-neutral-900">
                {formatMode(request.service_mode)}
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Budget
              </p>
              <p className="mt-2 text-sm font-medium text-neutral-900">
                {request.budget || "Not provided"}
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Posted
              </p>
              <p className="mt-2 text-sm font-medium text-neutral-900">
                {formatDate(request.created_at)}
              </p>
            </div>
          </div>

          {acceptedOffer ? (
            <div className="mt-8 rounded-[1.5rem] border border-neutral-200 bg-neutral-50 p-5">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                Accepted professional
              </p>

              <Link
                href={`/profile/${acceptedOffer.professional_id}`}
                className="mt-4 flex items-center gap-4 transition hover:opacity-80"
              >
                <div className="h-14 w-14 overflow-hidden rounded-full border border-neutral-200 bg-white">
                  {acceptedOffer.professional_avatar_url ? (
                    <img
                      src={acceptedOffer.professional_avatar_url}
                      alt={acceptedOffer.professional_name || "Professional"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-medium text-neutral-500">
                      {acceptedOffer.professional_name?.charAt(0).toUpperCase() || "P"}
                    </div>
                  )}
                </div>

                <div>
                  <p className="text-lg font-semibold text-neutral-900">
                    {acceptedOffer.professional_name || "Professional"}
                  </p>
                  <p className="text-sm text-neutral-500">
                    {acceptedOffer.professional_type
                      ? acceptedOffer.professional_type
                          .replaceAll("_", " ")
                          .replace(/\b\w/g, (char) => char.toUpperCase())
                      : "Beauty professional"}
                  </p>

                  <p className="mt-1 text-sm text-neutral-600">
                    {typeof acceptedOffer.average_rating === "number" &&
                    acceptedOffer.review_count
                      ? `${acceptedOffer.average_rating.toFixed(1)} ★ (${acceptedOffer.review_count} ${
                          acceptedOffer.review_count === 1 ? "review" : "reviews"
                        })`
                      : "No reviews yet"}
                  </p>
                </div>
              </Link>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          {message ? (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
              {message}
            </div>
          ) : null}

          {isCustomer ? (
            <div className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                Matched professionals
              </p>

              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                Who this request is visible to
              </h2>

              <p className="mt-4 leading-7 text-neutral-600">
                This request is currently shown only to matching professionals
                based on the service category selected.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                {request.target_professions?.length ? (
                  request.target_professions.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700"
                    >
                      {item
                        .replaceAll("_", " ")
                        .replace(/\b\w/g, (char) => char.toUpperCase())}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-sm text-neutral-700">
                    Not set
                  </span>
                )}
              </div>
            </div>
          ) : null}

          <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              Chat
            </p>

            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              Live conversation
            </h2>

            <p className="mt-4 leading-7 text-neutral-600">
              {canAccessChat
                ? "Once an offer is accepted, both sides can message here in real time."
                : "Chat opens once an offer is accepted."}
            </p>

            {!canAccessChat ? (
              <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
                Chat is only available to the customer and the accepted professional.
              </div>
            ) : null}

            {isChatReadOnly && canAccessChat ? (
              <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
                This chat is now read-only because the request has been completed.
              </div>
            ) : null}

            {canAccessChat ? (
              <>
                <div
                  ref={chatScrollRef}
                  className="mt-6 max-h-96 space-y-4 overflow-y-auto rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
                >
                  {chatMessages.length === 0 ? (
                    <p className="text-sm text-neutral-500">No messages yet.</p>
                  ) : (
                    chatMessages.map((chat) => {
                      const isMine = chat.sender_id === currentUserId;
                      const sender = chatProfiles[chat.sender_id];
                      const isSystemMessage =
                        chat.message ===
                          "Offer accepted. You can now chat here to coordinate details." ||
                        chat.message ===
                          "Completion requested. Waiting for customer confirmation." ||
                        chat.message === "Service confirmed as completed.";

                      if (isSystemMessage) {
                        return (
                          <div key={chat.id} className="flex justify-center">
                            <div className="max-w-[90%] rounded-full border border-neutral-200 bg-white px-4 py-2 text-center text-xs font-medium text-neutral-600">
                              {chat.message}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={chat.id}
                          className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`flex max-w-[85%] items-end gap-3 ${
                              isMine ? "flex-row-reverse" : "flex-row"
                            }`}
                          >
                            <div className="h-9 w-9 overflow-hidden rounded-full border border-neutral-200 bg-white">
                              {sender?.avatar_url ? (
                                <img
                                  src={sender.avatar_url}
                                  alt={sender.full_name || "User"}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-xs font-medium text-neutral-500">
                                  {sender?.full_name?.charAt(0).toUpperCase() || "U"}
                                </div>
                              )}
                            </div>

                            <div
                              className={`rounded-2xl px-4 py-3 text-sm ${
                                isMine
                                  ? "bg-black text-white"
                                  : "border border-neutral-200 bg-white text-neutral-900"
                              }`}
                            >
                              <p
                                className={`mb-1 text-xs font-medium ${
                                  isMine ? "text-neutral-300" : "text-neutral-500"
                                }`}
                              >
                                {isMine ? "You" : sender?.full_name || "User"}
                              </p>
                              <p>{chat.message}</p>
                              <p
                                className={`mt-2 text-xs ${
                                  isMine ? "text-neutral-300" : "text-neutral-500"
                                }`}
                              >
                                {formatChatTime(chat.created_at)}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="mt-4 flex gap-3">
                  <textarea
                    value={newChatMessage}
                    onChange={(e) => setNewChatMessage(e.target.value)}
                    rows={3}
                    disabled={isChatReadOnly}
                    placeholder={
                      isChatReadOnly
                        ? "This chat is now read-only because the service is completed."
                        : "Send a message..."
                    }
                    className="flex-1 rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500"
                  />

                  <button
                    type="button"
                    onClick={handleSendChatMessage}
                    disabled={isChatReadOnly || sendingChatMessage || !newChatMessage.trim()}
                    className="self-end rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    {isChatReadOnly ? "Completed" : sendingChatMessage ? "Sending..." : "Send"}
                  </button>
                </div>
              </>
            ) : null}
          </div>

          {isCustomer ? (
            <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                Customer actions
              </p>

              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                Manage your request
              </h2>

              <p className="mt-4 leading-7 text-neutral-600">
                Review offers, confirm completion, and manage the final result here.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                {request.status === "completion_requested" ? (
                  <button
                    type="button"
                    onClick={handleConfirmCompletion}
                    className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                  >
                    Confirm completion
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {isProfessional && request.status === "open" ? (
            <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                Professional actions
              </p>

              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                Respond to this request
              </h2>

              <p className="mt-4 leading-7 text-neutral-600">
                Send your offer with your timing, price, and why you’re a good fit.
              </p>

              <div className="mt-6">
                {hasSubmittedOffer ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                    You already have an active offer on this request.
                  </div>
                ) : (
                  <Link
                    href={`/requests/${request.id}/respond`}
                    className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
                  >
                    Respond to request
                  </Link>
                )}
              </div>
            </div>
          ) : null}

          {isAcceptedProfessional && request.status === "accepted" ? (
            <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
                Professional actions
              </p>

              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                Complete this service
              </h2>

              <p className="mt-4 leading-7 text-neutral-600">
                Once the service is finished, send a completion request to the customer.
              </p>

              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleRequestCompletion}
                  className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90"
                >
                  Mark service complete
                </button>
              </div>
            </div>
          ) : null}

          {isAcceptedProfessional && request.status === "completion_requested" ? (
            <div className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-500">
              Completion request sent. Waiting for customer confirmation.
            </div>
          ) : null}

          {isProfessional &&
          request.status === "completed" &&
          isAcceptedProfessional ? (
            <div className="rounded-[2rem] border border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-500">
              This service has been completed.
            </div>
          ) : null}

{isCustomer && request.status === "completed" ? (
  <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
    <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
      Review
    </p>

    <h2 className="mt-3 text-2xl font-semibold tracking-tight">
      {existingReview ? "Your review" : "Leave a review"}
    </h2>

    <p className="mt-4 leading-7 text-neutral-600">
      Share how the service went so future customers can make a confident choice.
    </p>

    {existingReview ? (
      <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
        <p className="text-lg font-semibold text-neutral-900">
          {"★".repeat(existingReview.rating)}
          {"☆".repeat(5 - existingReview.rating)}
        </p>

        {existingReview.comment ? (
          <p className="mt-3 leading-7 text-neutral-600">
            {existingReview.comment}
          </p>
        ) : (
          <p className="mt-3 text-neutral-500">No written comment added.</p>
        )}
      </div>
    ) : (
      <div className="mt-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-neutral-900">
            Rating
          </label>
          <select
            value={reviewRating}
            onChange={(e) => setReviewRating(Number(e.target.value))}
            className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500"
          >
            <option value={5}>5 - Excellent</option>
            <option value={4}>4 - Good</option>
            <option value={3}>3 - Okay</option>
            <option value={2}>2 - Poor</option>
            <option value={1}>1 - Bad</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-neutral-900">
            Comment
          </label>
          <textarea
            value={reviewComment}
            onChange={(e) => setReviewComment(e.target.value)}
            rows={5}
            placeholder="How was the service, professionalism, communication, and result?"
            className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500"
          />
        </div>

        <button
          type="button"
          onClick={handleSubmitReview}
          disabled={submittingReview}
          className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
        >
          {submittingReview ? "Submitting..." : "Submit review"}
        </button>
      </div>
    )}

    {request.accepted_professional_id ? (
      <div className="mt-6 border-t border-neutral-200 pt-6">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
          Book again
        </p>

        <p className="mt-3 leading-7 text-neutral-600">
          Want the same professional again? Send them a direct rebook request instead of posting to the full marketplace.
        </p>

        <div className="mt-4">
          <Link
            href={`/requests/new?rebook=1&pro=${request.accepted_professional_id}&request=${request.id}`}
            className="inline-flex rounded-full border border-neutral-300 px-5 py-3 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
          >
            Book again
          </Link>
        </div>
      </div>
    ) : null}
  </div>
) : null}

          <div className="rounded-[2rem] border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-neutral-500">
              Offers
            </p>

            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              {isCustomer ? "Incoming offers" : "Offer activity"}
            </h2>

            <p className="mt-4 leading-7 text-neutral-600">
              {isCustomer
                ? "Review offers submitted by professionals for this request."
                : "Customers will review submitted offers here."}
            </p>

            {offers.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-5">
                <p className="text-sm text-neutral-600">No offers yet.</p>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {offers.map((offer) => (
                  <div
                    key={offer.id}
                    className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <Link
                        href={`/profile/${offer.professional_id}`}
                        className="flex items-center gap-3 transition hover:opacity-80"
                      >
                        <div className="h-12 w-12 overflow-hidden rounded-full border border-neutral-200 bg-white">
                          {offer.professional_avatar_url ? (
                            <img
                              src={offer.professional_avatar_url}
                              alt={offer.professional_name || "Professional"}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs font-medium text-neutral-500">
                              {offer.professional_name?.charAt(0).toUpperCase() || "P"}
                            </div>
                          )}
                        </div>

                        <div>
                          <p className="text-lg font-semibold text-neutral-900">
                            {offer.professional_name || "Professional"}
                          </p>
                          <p className="text-sm text-neutral-500">
                            {offer.professional_type
                              ? offer.professional_type
                                  .replaceAll("_", " ")
                                  .replace(/\b\w/g, (char) => char.toUpperCase())
                              : "Beauty professional"}
                          </p>

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-600">
                            {typeof offer.average_rating === "number" &&
                            offer.review_count ? (
                              <>
                                <span className="font-medium text-neutral-900">
                                  {offer.average_rating.toFixed(1)} ★
                                </span>
                                <span>
                                  ({offer.review_count}{" "}
                                  {offer.review_count === 1 ? "review" : "reviews"})
                                </span>
                              </>
                            ) : (
                              <span>No reviews yet</span>
                            )}
                          </div>
                        </div>
                      </Link>

                      <div className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {isCustomer && unreadOfferIds.includes(offer.id) ? (
                            <span className="rounded-full bg-black px-3 py-1 text-xs font-medium uppercase tracking-wide text-white">
                              New
                            </span>
                          ) : null}

                          <span className="rounded-full bg-white px-3 py-1 text-xs font-medium uppercase tracking-wide text-neutral-700">
                            {getStatusLabel(offer.status)}
                          </span>
                        </div>

                        <p className="mt-2 text-lg font-semibold text-neutral-900">
                          {offer.proposed_price || "Price not provided"}
                        </p>
                      </div>
                    </div>

                    {offer.message ? (
                      <p className="mt-4 leading-7 text-neutral-600">
                        {offer.message}
                      </p>
                    ) : null}

                    {offer.status === "declined" &&
                    offer.customer_response_message ? (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                          Customer feedback
                        </p>
                        <p className="mt-2 text-sm leading-6 text-amber-900">
                          {offer.customer_response_message}
                        </p>
                      </div>
                    ) : null}

                    <p className="mt-4 text-xs text-neutral-500">
                      Submitted {formatDate(offer.created_at)}
                    </p>

                    {isProfessional &&
                    request.status === "open" &&
                    offer.status === "declined" ? (
                      <div className="mt-5 space-y-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingReofferId(offer.id);
                            setReofferMessage(offer.message ?? "");
                            setReofferPrice(offer.proposed_price ?? "");
                          }}
                          className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                        >
                          Re-offer
                        </button>

                        {editingReofferId === offer.id ? (
                          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                            <div>
                              <label className="text-sm font-medium text-neutral-900">
                                Updated message
                              </label>
                              <textarea
                                value={reofferMessage}
                                onChange={(e) => setReofferMessage(e.target.value)}
                                rows={4}
                                placeholder="Update your offer based on the customer’s feedback."
                                className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500"
                              />
                            </div>

                            <div className="mt-4">
                              <label className="text-sm font-medium text-neutral-900">
                                Updated price
                              </label>
                              <input
                                type="text"
                                value={reofferPrice}
                                onChange={(e) => setReofferPrice(e.target.value)}
                                placeholder="Enter updated price"
                                className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500"
                              />
                            </div>

                            <div className="mt-4 flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() => handleReoffer(offer.id)}
                                disabled={reofferLoading}
                                className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                              >
                                {reofferLoading ? "Submitting..." : "Submit re-offer"}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingReofferId(null);
                                  setReofferMessage("");
                                  setReofferPrice("");
                                }}
                                className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {isCustomer &&
                    request.status === "open" &&
                    offer.status === "pending" ? (
                      <div className="mt-5 space-y-3">
                        <div className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => handleAcceptOffer(offer.id)}
                            disabled={acceptingOfferId === offer.id}
                            className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                          >
                            {acceptingOfferId === offer.id ? "Accepting..." : "Choose offer"}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setDecliningOfferId(offer.id);
                              setDeclineMessage("");
                            }}
                            className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-100"
                          >
                            Decline offer
                          </button>
                        </div>

                        {decliningOfferId === offer.id ? (
                          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                            <label className="text-sm font-medium text-neutral-900">
                              Why are you declining this offer?
                            </label>

                            <textarea
                              value={declineMessage}
                              onChange={(e) => setDeclineMessage(e.target.value)}
                              rows={4}
                              placeholder="Example: Timing doesn’t work for me, price is too high, or I’m looking for a different fit."
                              className="mt-2 w-full rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition focus:border-neutral-500"
                            />

                            <div className="mt-3 flex flex-wrap gap-3">
                              <button
                                type="button"
                                onClick={() => handleDeclineOffer(offer.id)}
                                disabled={declineLoading}
                                className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
                              >
                                {declineLoading ? "Declining..." : "Submit decline"}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setDecliningOfferId(null);
                                  setDeclineMessage("");
                                }}
                                className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-neutral-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedPhoto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-white px-3 py-1 text-sm font-medium text-black"
            >
              Close
            </button>

            <img
              src={selectedPhoto}
              alt="Reference full size"
              className="max-h-[90vh] max-w-full rounded-2xl object-contain"
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
