import { NextResponse } from "next/server";
import { getAuthenticatedUser, getServiceSupabase } from "@/app/lib/serverSupabase";

export async function DELETE(req: Request) {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = getServiceSupabase();
  const uid = user.id;

  try {
    // Delete storage files for this user
    const buckets = ["avatars", "profile-banners", "portfolio-images"] as const;
    await Promise.all(
      buckets.map(async (bucket) => {
        const { data: files } = await service.storage.from(bucket).list(uid);
        if (files && files.length > 0) {
          await service.storage
            .from(bucket)
            .remove(files.map((f) => `${uid}/${f.name}`));
        }
      })
    );

    // Delete portfolio DB rows
    await service.from("professional_portfolio").delete().eq("professional_id", uid);

    // Delete services and availability
    await service.from("professional_services").delete().eq("professional_id", uid);
    await service.from("availability_slots").delete().eq("professional_id", uid);

    // Delete reviews
    await service.from("professional_reviews").delete().eq("reviewer_id", uid);
    await service.from("professional_reviews").delete().eq("professional_id", uid);

    // Delete offers sent as professional
    await service.from("request_offers").delete().eq("professional_id", uid);

    // Delete offers on requests they posted as customer
    const { data: theirRequests } = await service
      .from("service_requests")
      .select("id")
      .eq("client_id", uid);

    if (theirRequests && theirRequests.length > 0) {
      const ids = theirRequests.map((r: { id: string }) => r.id);
      await service.from("request_offers").delete().in("request_id", ids);
    }

    // Delete bookings
    await service.from("bookings").delete().eq("customer_id", uid);
    await service.from("bookings").delete().eq("professional_id", uid);

    // Delete service requests
    await service.from("service_requests").delete().eq("client_id", uid);

    // Delete profile
    await service.from("profiles").delete().eq("id", uid);

    // Delete the auth user
    const { error: deleteError } = await service.auth.admin.deleteUser(uid);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Account deletion error:", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
