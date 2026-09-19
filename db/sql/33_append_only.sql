-- TRACE application security: 33 append-only enforcement.
-- Run AFTER 30/31/32, as the schema owner. Re-runnable.
-- Cases are never hard-deleted; audit/payments are append-only.

revoke update, delete on public.actions from app_user;
revoke delete on public.records from app_user;
revoke update, delete on public.citation_payments from app_user;
revoke update on public.referral_documents from app_user;
revoke delete on public.case_assignments from app_user;
revoke delete on public.impound_custody from app_user;
revoke delete on public.missing_person_cases,
  public.wanted_person_cases,
  public.vehicle_cases,
  public.accidents,
  public.accident_vehicles,
  public.traffic_citations from app_user;
