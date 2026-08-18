# Changelog

Material user-visible and operational changes are recorded here at milestone boundaries. Do not add an entry for every internal checkpoint.

## Unreleased

- Replaced synthetic fixture identities and QA-marked copy with nine natural,
  media-rich social profiles, current multi-author Stories and realistic
  conversations/notifications; Story rails now group one ring per author with
  segmented per-author viewing on web and Ionic, and logout no longer starts
  protected feed/profile requests after clearing the session. Fixture account
  provisioning now derives its hash from the operator-supplied password and
  fails safely on username collisions without rewriting unrelated user data.

- Completed the final demo-readiness closure with repeatable audience-specific
  Story fixtures, owner-safe media cleanup, and real web/Ionic community leave
  plus public rejoin flows; the populated two-account journey and final
  desktop/phone browser checks now pass with clean network and console state.

- Consolidated the first-run, repeat-start, demo-account, route-tour, safe-stop
  and recovery documentation around the current idempotent seed and real
  web/Ionic product surfaces; removed stale claims about admin access,
  registration activation, media/profile/social features and Stories.

- Hardened final resource and account-isolation gates with bounded media
  uploads, atomic owner quota reservation, bounded social cursors, session-safe
  Blob/picker cleanup and subject-scoped feed, messaging and realtime state.

- Added real authorized image/video attachments to web and Ionic post/quote
  composers, including previews, retry/removal, failure-safe draft recovery,
  feed/detail rendering and server-enforced media ownership/readiness/audience.
- Completed authorized media across saved cards and shared-post source context,
  with a responsive full-size viewer that preserves focus, video controls and
  bounded Blob lifecycles.
- Added real authorized profile avatar/cover upload and rendering plus a public
  profile timeline/media view with permission-safe, bounded cursor pagination.
- Added privacy-safe follower/following totals and paged profile lists plus an
  owner-only incoming private follow-request queue with real accept/reject.
- Completed real comment identity, bounded replies and cursor paging across
  feed/detail, with owner-only edit/delete, deleted tombstones and parent-post
  privacy enforcement.
- Completed private messaging media, reply context, owner edit/delete and
  delivery/read states on web and Ionic, including block-safe downloads,
  realtime version ordering and failure-safe conversation switching.
- Completed first-class anonymous/open Q&A with audience-safe answered-profile
  surfaces, identity redaction, public detail access and confirmed owner delete.
- Completed community rules, pins and moderator membership management through
  real role-safe contracts; deferred community posting until its domain model is coherent.
- Added safe clickable mentions and hashtags across social text, route-driven
  hashtag discovery, and real contextual reporting on posts, profiles,
  communities and eligible messages without exposing internal record IDs.
- Aligned notification copy and entity-aware destinations, and made follow and
  private-request notifications durable, retryable, privacy-safe and directly
  actionable without allowing stale relationship events to leak identities.
- Corrected the reproducible demo comment fixture to use the domain-valid
  `Visible` status so notification-to-content journeys load real threads.
- Added a non-destructive media-rich local demo loader with original compact
  image/video assets, populated profile/post/message surfaces, pending social
  state, real comment replies and PowerShell 5-safe repeatable API uploads.
- Completed the populated all-web light/dark and responsive quality pass, and
  corrected native checkbox mixed-state semantics while preserving existing
  route hierarchy, interactions and visual language.
- Added native Ionic profile, content, question and community deep routes with
  authorized profile/post media, safe route reuse, account-scoped profile
  caching and visible keyboard focus at phone widths.
- Completed Ionic messaging, Q&A, notifications and social-graph parity with
  route-safe recipient/conversation preselection, real audience and owner
  controls, privacy-safe graph requests and account-change cleanup.
- Added the real Stories backend vertical slice with server-owned 24-hour
  expiry, public/follower/close-friend authorization, bounded active/profile
  paging, owner deletion, OpenAPI clients and version-safe media claims that
  prevent active Story assets from being deleted during concurrent requests.
- Added compact web Story rails to feed and public profiles, with real
  single-media authoring, account-scoped viewed state, authorized image/video
  viewing, keyboard/focus-safe dialogs, owner deletion and responsive
  light/dark layouts; local Compose now supplies the Stories persistence
  connections required for a healthy demo startup.
- Added the same real Story authoring, rail and authorized viewer to Ionic feed
  and profile routes, with swipe/button navigation, safe-area-aware modals,
  focus restoration, owner deletion and account-safe draft/media cleanup.
- Completed the Reels feasibility gate and deliberately deferred a dedicated
  short-video surface until truthful video metadata, bounded video discovery
  and resource-safe delivery contracts exist; no fake tab or static feed was added.
- Avoided protected operations requests for known non-administrator sessions while retaining API-enforced authorization and the authorized dashboard flow.
- Made Angular and Ionic development proxies use the reliable IPv4 loopback path, preventing Windows `localhost` resolution stalls from surfacing as false login failures.
- Corrected the shared authentication story panel's dark-theme surface and copy roles while preserving the existing light-theme editorial treatment and narrow layout.
- Stabilized local demo startup and authenticated profile loading: web now waits for API readiness, ordinary API proxy requests avoid WebSocket upgrade semantics, and shared profile consumers issue one session-safe request.
- Preserved authenticated web sessions across same-tab reloads and protected deep links, aligned shell colors with the active theme, repaired collapsed mobile feed cards, and replaced feed ranker diagnostics with readable discovery reasons.
- Added real expandable feed comment threads with honest identity fallbacks, recoverable comment submission, and account-backed saved-state hydration.
- Kept newly published posts visible from the real create response even when the Following ranker does not immediately return the author's own post.
- Focused discovery on race-safe search, real typed results, trends and communities; added honest empty/error recovery states and moved advanced creation, upload and reporting controls behind accessible disclosures.
- Repaired message chronology, duplicate-safe pending sends, failed-send draft recovery, truthful realtime/deleted states, and notification deep links that now select their requested conversation.
- Proactively rotates expiring access tokens through one coalesced refresh before HTTP and SignalR calls, preventing mid-demo 401 bursts and stranded realtime connections.
- Repaired the shared profile-picker submit path used by messaging, relationships and questions; added confirmed blocking, resilient question inbox states, bounded sessions, persistent appearance controls, and non-rendered MFA/recovery secrets.
- Restores every SPA route transition to the top while retaining anchor navigation, preventing a previous long page's scroll position from hiding the next route heading.
- Aligned seeded moderation records with the domain contract so authorized operations load without server errors, and translated every real case status and subject into readable Turkish labels.
- Preserved Ionic/PWA authentication across same-tab reloads and protected deep links, refreshed expiring tokens before requests, and declared the existing app icon to keep mobile startup clean.
- Prepared project-specific Factory Droid Mission contracts, frontend art direction, design-system guidance, quota-safe recovery policy, and browser-quality gates.
