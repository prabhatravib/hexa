
   Repo search shows the following files have no inbound references (only self-definitions in rg results), so they appear to
   be dead code: cf-worker/frontend/src/components/QuestionHub.tsx, cf-worker/frontend/src/components/SelectionIndicator.tsx,
    cf-worker/frontend/src/components/InfflowApp.tsx (empty stub), cf-worker/frontend/src/hooks/use-mobile.ts,
   cf-worker/frontend/src/utils/svg-search-events.ts, cf-worker/frontend/src/utils/svg-inject-search-overlay.ts,
   cf-worker/frontend/src/utils/chart-container-alignment.ts, cf-worker/frontend/src/fixtures/clusters.sample.json,
   cf-worker/frontend/src/settings/theme.ts, cf-worker/frontend/src/settings/types.d.ts, and cf-worker/worker/worker.ts.
   Because the overlay injectors are unused, the .central-search-overlay styles in
   cf-worker/frontend/src/styles/components.css are also redundant and only touched by those unused utilities.