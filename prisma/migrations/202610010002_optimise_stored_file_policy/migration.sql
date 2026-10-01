DROP POLICY IF EXISTS stored_files_tenant_isolation ON public.stored_files;

CREATE POLICY stored_files_tenant_isolation ON public.stored_files
  USING (
    "organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid
  )
  WITH CHECK (
    "organisationId" = nullif((SELECT current_setting('app.current_organisation_id', true)), '')::uuid
  );
