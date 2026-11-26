-- Faster row-level security, same rules. Safe to re-run.
--
-- Supabase's performance advisor (24 Nov 2026, after the live database stalled)
-- flagged 71 policies that call auth.uid() once per row and 35 tables with
-- overlapping policies. This migration:
--   1. drops 5 policies that are exact copies of another policy on the same
--      table (same command, roles and condition), so access is unchanged;
--   2. rewrites every remaining policy that uses auth.uid() to use
--      (select auth.uid()), which Postgres evaluates once per query instead of
--      once per row. The condition is otherwise identical;
--   3. pins search_path on 6 trigger functions (security advisor).
-- Tested on the "LineUp Test" project with the full e2e suite before going live.

begin;

-- 1. Exact duplicates.
drop policy if exists "authenticated users can insert notifications" on public.notifications; -- same as "allow insert notifications"
drop policy if exists "read own notifications" on public.notifications; -- same as "Users can view their own notifications"
drop policy if exists "users can view their own notifications" on public.notifications; -- same as "Users can view their own notifications"
drop policy if exists "Anyone can view reviews" on public.professional_reviews; -- same as "Anyone can view professional reviews"
drop policy if exists "customers can update offers on their own requests" on public.request_offers; -- same as "Customers can update offers on own requests"

-- 2. auth.uid() once per query.
alter policy "owners read their alerts" on public.analytics_alerts using (((professional_id = (select auth.uid())) OR ((studio_id IS NOT NULL) AND is_studio_manager(studio_id))));
alter policy "pros read their own rollups" on public.analytics_daily using ((professional_id = (select auth.uid())));
alter policy "Booking participants can read messages" on public.booking_messages using ((EXISTS ( SELECT 1 FROM bookings WHERE ((bookings.id = booking_messages.booking_id) AND ((bookings.customer_id = (select auth.uid())) OR (bookings.professional_id = (select auth.uid())))))));
alter policy "Booking participants can send messages" on public.booking_messages with check (((sender_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM bookings WHERE ((bookings.id = booking_messages.booking_id) AND ((bookings.customer_id = (select auth.uid())) OR (bookings.professional_id = (select auth.uid()))))))));
alter policy "Customers can insert bookings for themselves" on public.bookings with check (((select auth.uid()) = customer_id));
alter policy "Customers can update their own bookings" on public.bookings using (((select auth.uid()) = customer_id));
alter policy "Customers can view their own bookings" on public.bookings using (((select auth.uid()) = customer_id));
alter policy "Professionals can update bookings on themselves" on public.bookings using (((select auth.uid()) = professional_id));
alter policy "Professionals can view bookings on themselves" on public.bookings using (((select auth.uid()) = professional_id));
alter policy "owners read their expenses" on public.business_expenses using ((((studio_id IS NULL) AND (owner_id = (select auth.uid()))) OR ((studio_id IS NOT NULL) AND is_studio_owner(studio_id))));
alter policy "Professionals insert their own ratings" on public.customer_reviews with check (((select auth.uid()) = reviewer_id));
alter policy "pros and shop managers read import batches" on public.import_batches using (((professional_id = (select auth.uid())) OR ((studio_id IS NOT NULL) AND is_studio_manager(studio_id))));
alter policy "System can insert notifications" on public.notifications with check (((select auth.uid()) = user_id));
alter policy "Users can update their own notifications" on public.notifications using (((select auth.uid()) = user_id));
alter policy "Users can view their own notifications" on public.notifications using (((select auth.uid()) = user_id));
alter policy "clients can insert notifications for their own requests" on public.notifications with check ((EXISTS ( SELECT 1 FROM service_requests sr WHERE ((sr.id = notifications.request_id) AND (sr.client_id = (select auth.uid()))))));
alter policy "clients can view notifications for their own requests" on public.notifications using ((EXISTS ( SELECT 1 FROM service_requests sr WHERE ((sr.id = notifications.request_id) AND (sr.client_id = (select auth.uid()))))));
alter policy "update own notifications" on public.notifications using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));
alter policy "users can update their own notifications" on public.notifications using ((user_id = (select auth.uid()))) with check ((user_id = (select auth.uid())));
alter policy "pros manage own client notes" on public.pro_client_notes using (((select auth.uid()) = professional_id)) with check (((select auth.uid()) = professional_id));
alter policy "Professionals can delete their own availability" on public.professional_availability using (((select auth.uid()) = professional_id));
alter policy "Professionals can insert their own availability" on public.professional_availability with check (((select auth.uid()) = professional_id));
alter policy "Professionals can update their own availability" on public.professional_availability using (((select auth.uid()) = professional_id));
alter policy "Professionals can view their own availability" on public.professional_availability using (((select auth.uid()) = professional_id));
alter policy "own home base: add" on public.professional_home_base with check (((select auth.uid()) = profile_id));
alter policy "own home base: edit" on public.professional_home_base using (((select auth.uid()) = profile_id)) with check (((select auth.uid()) = profile_id));
alter policy "own home base: read" on public.professional_home_base using (((select auth.uid()) = profile_id));
alter policy "Professionals can insert own portfolio" on public.professional_portfolio with check ((user_id = (select auth.uid())));
alter policy "Professionals can view own portfolio" on public.professional_portfolio using ((user_id = (select auth.uid())));
alter policy "Users can delete their own portfolio" on public.professional_portfolio using (((select auth.uid()) = user_id));
alter policy "Users can insert their own portfolio" on public.professional_portfolio with check (((select auth.uid()) = user_id));
alter policy "Users can insert reviews" on public.professional_reviews with check (((select auth.uid()) = reviewer_id));
alter policy "Professionals can delete their own services" on public.professional_services using (((select auth.uid()) = professional_id));
alter policy "Professionals can insert their own services" on public.professional_services with check (((select auth.uid()) = professional_id));
alter policy "Professionals can update their own services" on public.professional_services using (((select auth.uid()) = professional_id));
alter policy "Professionals can view their own services" on public.professional_services using (((select auth.uid()) = professional_id));
alter policy "pros manage own time off" on public.professional_time_off using ((professional_id = (select auth.uid()))) with check ((professional_id = (select auth.uid())));
alter policy "professionals read own verifications" on public.professional_verifications using (((select auth.uid()) = professional_id));
alter policy "Users can insert their own profile" on public.profiles with check (((select auth.uid()) = id));
alter policy "Users can update their own profile" on public.profiles using (((select auth.uid()) = id)) with check (((select auth.uid()) = id));
alter policy "users manage their own push subscriptions" on public.push_subscriptions using (((select auth.uid()) = user_id)) with check (((select auth.uid()) = user_id));
alter policy "pros manage own dismissals" on public.request_dismissals using (((select auth.uid()) = professional_id)) with check (((select auth.uid()) = professional_id));
alter policy "Accepted participants can insert request messages" on public.request_messages with check ((((select auth.uid()) = sender_id) AND (EXISTS ( SELECT 1 FROM service_requests sr WHERE ((sr.id = request_messages.request_id) AND (((select auth.uid()) = sr.client_id) OR ((select auth.uid()) = sr.accepted_professional_id)))))));
alter policy "Accepted participants can view request messages" on public.request_messages using ((EXISTS ( SELECT 1 FROM service_requests sr WHERE ((sr.id = request_messages.request_id) AND (((select auth.uid()) = sr.client_id) OR ((select auth.uid()) = sr.accepted_professional_id))))));
alter policy "Customers can update offers on own requests" on public.request_offers using ((EXISTS ( SELECT 1 FROM service_requests sr WHERE ((sr.id = request_offers.request_id) AND (sr.client_id = (select auth.uid())))))) with check ((EXISTS ( SELECT 1 FROM service_requests sr WHERE ((sr.id = request_offers.request_id) AND (sr.client_id = (select auth.uid()))))));
alter policy "Customers can update offers on their own requests" on public.request_offers using ((EXISTS ( SELECT 1 FROM service_requests WHERE ((service_requests.id = request_offers.request_id) AND (service_requests.client_id = (select auth.uid())))))) with check ((EXISTS ( SELECT 1 FROM service_requests WHERE ((service_requests.id = request_offers.request_id) AND (service_requests.client_id = (select auth.uid()))))));
alter policy "Customers can view offers on own requests" on public.request_offers using ((EXISTS ( SELECT 1 FROM service_requests sr WHERE ((sr.id = request_offers.request_id) AND (sr.client_id = (select auth.uid()))))));
alter policy "Customers can view offers on their own requests" on public.request_offers using ((EXISTS ( SELECT 1 FROM service_requests WHERE ((service_requests.id = request_offers.request_id) AND (service_requests.client_id = (select auth.uid()))))));
alter policy "Professionals can create own offers on open requests" on public.request_offers with check (((professional_id = (select auth.uid())) AND (EXISTS ( SELECT 1 FROM service_requests sr WHERE ((sr.id = request_offers.request_id) AND (sr.status = 'open'::text))))));
alter policy "Professionals can insert their own offers" on public.request_offers with check ((((select auth.uid()) = professional_id) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (select auth.uid())) AND ((profiles.role = 'professional'::text) OR (profiles.role = 'I am a professional'::text)))))));
alter policy "Professionals can update own offers" on public.request_offers using ((professional_id = (select auth.uid()))) with check ((professional_id = (select auth.uid())));
alter policy "Professionals can update their own offers" on public.request_offers using (((select auth.uid()) = professional_id)) with check (((select auth.uid()) = professional_id));
alter policy "Professionals can view own offers" on public.request_offers using ((professional_id = (select auth.uid())));
alter policy "Professionals can view their own offers" on public.request_offers using (((select auth.uid()) = professional_id));
alter policy "clients manage own saved pros" on public.saved_pros using (((select auth.uid()) = client_id)) with check (((select auth.uid()) = client_id));
alter policy "Accepted professional can update assigned requests" on public.service_requests using ((accepted_professional_id = (select auth.uid()))) with check ((accepted_professional_id = (select auth.uid())));
alter policy "Accepted professional can view assigned requests" on public.service_requests using ((accepted_professional_id = (select auth.uid())));
alter policy "Authenticated users can view relevant service requests" on public.service_requests using (((client_id = (select auth.uid())) OR (accepted_professional_id = (select auth.uid())) OR (preferred_professional_id = (select auth.uid())) OR ((status = 'open'::text) AND (COALESCE(is_direct_rebook, false) = false))));
alter policy "Customers can insert their own requests" on public.service_requests with check ((((select auth.uid()) = client_id) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (select auth.uid())) AND ((profiles.role = 'customer'::text) OR (profiles.role = 'I am a customer'::text)))))));
alter policy "Customers can update their own requests" on public.service_requests using ((((select auth.uid()) = client_id) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (select auth.uid())) AND ((profiles.role = 'customer'::text) OR (profiles.role = 'I am a customer'::text))))))) with check ((((select auth.uid()) = client_id) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (select auth.uid())) AND ((profiles.role = 'customer'::text) OR (profiles.role = 'I am a customer'::text)))))));
alter policy "Customers can view their own requests" on public.service_requests using ((((select auth.uid()) = client_id) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (select auth.uid())) AND ((profiles.role = 'customer'::text) OR (profiles.role = 'I am a customer'::text)))))));
alter policy "Professionals can view matching open requests" on public.service_requests using (((status = 'open'::text) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = 'professional'::text) AND (profiles.professional_type = ANY (service_requests.target_professions)))))));
alter policy "pros and managers read front desk" on public.shop_appointments using (((professional_id = (select auth.uid())) OR is_studio_manager(studio_id)));
alter policy "pros and shop managers read client links" on public.studio_client_pros using (((professional_id = (select auth.uid())) OR ((studio_id IS NOT NULL) AND is_studio_manager(studio_id))));
alter policy "members read own row, managers read team" on public.studio_members using (((profile_id = (select auth.uid())) OR is_studio_manager(studio_id)));
alter policy "team reads own studio" on public.studios using (((owner_id = (select auth.uid())) OR is_studio_member(id)));
alter policy "owners read their tax settings" on public.tax_settings using (((professional_id = (select auth.uid())) OR ((studio_id IS NOT NULL) AND is_studio_owner(studio_id))));
alter policy "people read their own weekly pushes" on public.weekly_push_log using ((profile_id = (select auth.uid())));

-- 3. Fixed search_path on trigger functions.
alter function public.protect_profile_studio_fields() set search_path = public;
alter function public.protect_profile_verification_fields() set search_path = public;
alter function public.require_verified_professional_for_offers() set search_path = public;
alter function public.sync_direct_booking_with_subscription() set search_path = public;
alter function public.protect_profile_privileged_fields() set search_path = public;
alter function public.bookings_server_only() set search_path = public;

commit;
