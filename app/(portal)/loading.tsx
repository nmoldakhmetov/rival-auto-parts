// Instant route-transition feedback for every portal page: the sidebar and
// header stay (they live in the layout), and the page area shows a shimmer
// skeleton the moment a link is clicked instead of freezing on the old page
// while the server renders the dynamic route.
export default function PortalLoading() {
  return (
    <div className="space-y-4 px-6 py-6">
      <div className="skeleton h-7 w-64" />
      <div className="skeleton h-4 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-24 w-full" />
        <div className="skeleton h-24 w-full" />
      </div>
      <div className="skeleton h-[420px] w-full" />
    </div>
  );
}
