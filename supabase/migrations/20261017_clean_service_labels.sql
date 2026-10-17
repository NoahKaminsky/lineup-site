-- Requests used to store their service as "Category: Service" ("Hair:
-- Haircut", or several joined with " • "), and request-flow bookings copied
-- that into service_name. New requests store just the services; this tidies
-- the rows saved before that change. Safe to run more than once.

update service_requests
set service_detail = regexp_replace(service_detail, '(^|•\s*)[^:•]{1,40}:\s*', '\1', 'g')
where service_detail ~ '(^|•\s*)[^:•]{1,40}:\s*';

update bookings
set service_name = regexp_replace(service_name, '(^|•\s*)[^:•]{1,40}:\s*', '\1', 'g')
where service_name ~ '(^|•\s*)[^:•]{1,40}:\s*';
