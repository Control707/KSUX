# Kennesaw State University Public Data Sources & Feeds Audit

> **Ticket**: [`Control707/KSUX#2`](https://github.com/Control707/KSUX/issues/2) — *Audit public Kennesaw State data sources and feeds*  
> **Audit Timestamp**: `2026-11-16T02:57Z–03:39Z` (`2026-11-15` late evening EST, Fall 2026 semester)  
> **Verification Method**: Direct, read-only HTTP `GET`/`POST`/`HEAD` probes (`curl` with `Origin: https://ksux.app` and server-to-server headers) against live first-party Kennesaw State University (`KSU`) domains and vendor backends across both the `Kennesaw` and `Marietta` Campuses.

---

## Executive Summary

Most KSU daily-life modules in KSUX can be hydrated automatically from **free, unauthenticated first-party JSON, GTFS/GTFS-RT, iCal, RSS, and XML/GeoJSON feeds**—provided KSUX ingests several non-CORS feeds **server-side** rather than directly from the browser. Only **two capabilities** lack a public live feed and require `Student` crowdsourcing or `Student`-initiated action:

1. **Live `Parking Lot` Occupancy (`Parking Report` crowdsourcing required)**: KSU exposes rich static `Parking Lot` metadata, permit classifications, and GeoJSON/XML polygons across `Kennesaw` and `Marietta`, but **zero public live deck occupancy sensors or counter APIs**. KSU's own *Early Semester Parking Guide* (`parking-pulse.php`) relies on static scheduled class-enrollment histograms, and T2 Flex (`kennesaw.t2hosted.com`) is gated behind Queue-it + NetID/Duo SSO. Real-time deck fullness in KSUX **must** be powered by time-stamped `Student` `Parking Report` updates (optionally blended with Banner 9 class-enrollment curves as a baseline prior).
2. **Per-`Student` Personal Class Schedule & Official `Study Room` Checkout (NetID/Duo SSO gated)**:
   - While KSU's **entire master course schedule** (`7,333` Spring 2027 sections across `Kennesaw` and `Marietta` via Ellucian Banner 9 `srs-owlexpress.kennesaw.edu`) and **26,243 course syllabi** (`kennesaw.simplesyllabus.com`) are **100% publicly readable via unauthenticated JSON**, an individual `Student`'s enrolled schedule inside Owl Express (`owlexpress.kennesaw.edu`) and D2L Brightspace (`kennesaw.view.usg.edu`) sits behind Microsoft Entra ID SAML + Duo SSO. KSUX should support `.ics` schedule upload/paste **plus** a zero-friction CRN / course-code picker backed by the pre-ingested Banner 9 catalog for `Course Hub` onboarding.
   - Similarly, KSU Libraries' Springshare LibCal (`kennesaw.libcal.com`) exposes **all 47 `Study Room`s and real-time 30-minute availability slots unauthenticated**, whereas submitting a reservation checkout (`booking/add` / LibAuth) requires KSU NetID/Duo SSO—so KSUX can show live open `Study Room`s, host `Study Session` coordination, and deep-link `Student`s to LibCal to lock in official reservations.

### Master Capability Matrix

| KSUX Domain | Primary Vendor / System | Public Unauthenticated Read? | Browser CORS (`Access-Control-Allow-Origin`) | Auth Wall (NetID / Duo SSO) | KSUX Ingestion Strategy |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **University `Event`s & Campus Places** | Concept3D Localist (`calendar.kennesaw.edu`) | **Yes** — REST JSON v2, `.ics`, RSS 2.0 | **`*`** on `/api/2/*` (none on `.ics`/`.xml`) | Only for posting/admin | Direct JSON sync (`/api/2/events`, `/api/2/places`); has explicit `Kennesaw` & `Marietta` `Campus` IDs + lat/lng |
| **`Club` Directory & Involvement `Event`s** | Anthology Engage (`kennesaw.campuslabs.com/engage`) + Suitable (`app.suitable.co/institution/10219`) | **Partial / Split** — `owllife.kennesaw.edu` now `301`s to Suitable (SSO-locked), **but** `kennesaw.campuslabs.com/engage` remains live & public (`544` orgs + `Event`s) | **`*` only on `events.rss`**; absent on `/api/discovery/*` and `events.ics`; Suitable returns `403 Invalid CORS` | Suitable `/v1/institutions/10219/*` returns `401 Bearer` (SAML SSO); Engage RSVP/roster requires SSO | Ingest `Club` profiles & `Event`s server-side from `kennesaw.campuslabs.com/engage` + Localist; allow `Club` officers/`Student`s to post `Event`s natively in KSUX |
| **Transit (`Shuttle Route` — Big Owl Bus)** | Passio Technologies (`kennesawstate.passiogo.com` / `passio3.com`, agency `66` / `kennesaw`) | **Yes** — Official GTFS Static `.zip`, GTFS-RT v2.0 JSON + Protobuf, and `mapGetData.php` JSON | **`*`** on GTFS-RT & `mapGetData.php` | **None** (`goAuthenticationType: "0"`) | Poll GTFS-RT (`vehiclePositions.json`, `tripUpdates.json`, `serviceAlerts.json`) + cache GTFS `google_transit.zip` (`11` `Shuttle Route`s, `35` stops, polylines) |
| **`Study Room`s & Library Hours** | Springshare LibCal (`kennesaw.libcal.com`, `iid=22`) | **Yes (Read)** — `15` Sturgis (`Kennesaw`) + `32` Johnson (`Marietta`) rooms & live 30-min grid JSON | **`*` on `api_hours_today.php`**; absent on `/spaces/availability/grid` (requires `Referer`) | **Checkout/Booking** (`libapps.com` SAML + Duo SSO) | Server-side cached read of `/spaces/availability/grid` + `/api_hours_today.php`; coordinate `Study Session`s in KSUX & deep-link to `/space/{eid}` to book |
| **`Parking Lot`s, Maps & `Meetup Spot`s** | KSU Parking CMS + CampusTours AnyTour (`maps.kennesaw.edu`) + T2 Flex (`kennesaw.t2hosted.com`) | **Static Only** — `CL_kennesaw.xml` (`1.75 MB` XML/GeoJSON polygons, buildings, permit layers) + PDF maps & rate tables | Absent on `maps.kennesaw.edu/xml/*` | T2 Flex Portal (`permitlobby.t2hosted.com` Queue-it + Duo SSO); **zero public live deck sensors** | Seed `Parking Lot` & `Meetup Spot` geometries from `CL_kennesaw.xml` + Localist `/api/2/places`; **crowdsource live fullness via `Student` `Parking Report`s** |
| **Dining (`The Commons`, `Stingers`, Retail)** | Sodexo / KSU Dining + Nutrislice (`ksu.nutrislice.com` / `ksu.api.nutrislice.com`) | **Yes** — REST JSON for all `17` venues, station menus, ingredients, allergens, nutrition + HTML hours | Absent for third-party origins (`Vary: Origin`) | None for menus/hours; Grubhub/TransAct mobile ordering requires login | Server-side sync from `ksu.api.nutrislice.com` + scrape-safe hours table on `hours-locations.php` |
| **`Course Hub` Catalog & Schedules** | Ellucian Banner 9 (`srs-owlexpress.kennesaw.edu`), Simple Syllabus (`kennesaw.simplesyllabus.com`), Owl Express & D2L (`kennesaw.view.usg.edu`) | **Catalog: Yes** (`7,333` Spring 2027 sections + `26,243` syllabi in public JSON). **Personal schedule: No** | Absent (`Vary: Origin`) | Personal schedules in Owl Express & D2L gated behind Microsoft Entra ID SAML (`45f26ee5-...`) + Duo | Pre-seed all `Course Hub`s from Banner 9 `mode=search` JSON; onboard `Student`s via **CRN/course typeahead** + optional `.ics` file import |

---

## 1. Events & Clubs (`Event`, `Club`)

### 1.1 Critical Platform Finding: `owllife.kennesaw.edu` Redirects to Suitable, While `kennesaw.campuslabs.com` Remains Live

KSU's legacy vanity hostname `https://owllife.kennesaw.edu` **no longer points to CampusLabs Engage**. Every path on `owllife.kennesaw.edu` returns an unconditional `HTTP 301 Moved Permanently` to **Suitable** (`https://app.suitable.co/institution/10219/`), breaking any naive requests to `owllife.kennesaw.edu/api/discovery/*`:

| Probed URL | HTTP Status | `Content-Type` | Observed Redirect / Behavior |
| :--- | :--- | :--- | :--- |
| [`https://owllife.kennesaw.edu/`](https://owllife.kennesaw.edu/) | `301 Moved Permanently` | `text/html` | `Location: https://app.suitable.co/institution/10219/` |
| [`https://owllife.kennesaw.edu/api/discovery/event/search?take=5`](https://owllife.kennesaw.edu/api/discovery/event/search?take=5) | `301 Moved Permanently` | `text/html` | `Location: https://app.suitable.co/institution/10219/?take=5` (serves Angular/React login SPA HTML, **not JSON**) |
| [`https://owllife.kennesaw.edu/api/discovery/organization?take=5`](https://owllife.kennesaw.edu/api/discovery/organization?take=5) | `301 Moved Permanently` | `text/html` | `Location: https://app.suitable.co/institution/10219/?take=5` |
| [`https://owllife.kennesaw.edu/events.ics`](https://owllife.kennesaw.edu/events.ics) | `301 Moved Permanently` | `text/html` | `Location: https://app.suitable.co/institution/10219/` |
| [`https://owllife.kennesaw.edu/events.rss`](https://owllife.kennesaw.edu/events.rss) | `301 Moved Permanently` | `text/html` | `Location: https://app.suitable.co/institution/10219/` |

#### Suitable (`app.suitable.co/institution/10219/`) Auth & CORS Audit
Inspecting Suitable's CloudFront webpack bundle (`https://d2pfp8afw01t91.cloudfront.net/webpack/app.b568f6438aa9d84e8bc7.js`) revealed its REST base URL `https://app.suitable.co/v1`:
- **Cross-origin browser requests** (`Origin: https://ksux.app`): Rejected by Cloudflare/Spring CORS filter with `HTTP 403 Forbidden` (`Invalid CORS request`).
- **Server-side institution bootstrap** ([`https://app.suitable.co/v1/institutions/10219`](https://app.suitable.co/v1/institutions/10219), no `Origin` header): Returns `HTTP 200 OK` (`application/json`) confirming KSU Student Affairs' Owl Life co-curricular pathway (`id: "10219"`, `name: "Kennesaw State University, Student Affairs"`, `studentCount: 93787`, `pathwayId: "9790"`, `pathwayShort.title: "Owl Life"`), plus employer partner metadata.
- **Activities & Organizations on Suitable** (`/v1/institutions/10219/activities`, `/v1/institutions/10219/organizations`, `/v1/institutions/10219/public`): All return **`HTTP 401 Unauthorized`** with `WWW-Authenticate: Bearer` (`{"status":401,"error":"Unauthorized"}`), strictly gated behind KSU NetID/Duo SAML SSO.

### 1.2 Anthology / CampusLabs Engage Direct Tenant (`kennesaw.campuslabs.com/engage`) — Publicly Readable

Despite the vanity-domain repointing, KSU's underlying Anthology Engage instance (`institutionId: 206`, `communityId: 327`) at [`https://kennesaw.campuslabs.com/engage/`](https://kennesaw.campuslabs.com/engage/) **is still live, unauthenticated (`HTTP 200 OK`), and actively publishing Fall 2026 `Event`s and `544` `Club`/department records**:

| Endpoint | HTTP Status | `Content-Type` | CORS Header | Live Verified Payload Summary |
| :--- | :--- | :--- | :--- | :--- |
| [`https://kennesaw.campuslabs.com/engage/api/discovery/event/search?endsAfter=2026-11-15T00:00:00Z&take=5`](https://kennesaw.campuslabs.com/engage/api/discovery/event/search?endsAfter=2026-11-15T00:00:00Z&take=5) | `200 OK` | `application/json; charset=utf-8` | None | `@odata.count: 26` upcoming public `Event`s (e.g., *Create and Cultivate* `2026-11-16`, *MUST Ministries Mobile Pantry* `2026-11-18`, *Scrappy Hour* `2026-11-19`, *Analytics Day* `2026-12-04`; `39,051` historical/total events; latest `BranchId=77246` `Club` event on `2026-11-12` by *Philosophy Student Association*) |
| [`https://kennesaw.campuslabs.com/engage/api/discovery/organization?take=5&skip=0`](https://kennesaw.campuslabs.com/engage/api/discovery/organization?take=5&skip=0) | `200 OK` | `application/json; charset=utf-8` | None | `totalItems: 544` active `Club`s & departments (`id`, `name`, `shortName`, `websiteKey`, `email`, `description` HTML, `summary`, `profilePicture`, `parentId`) |
| [`https://kennesaw.campuslabs.com/engage/api/discovery/search/organizations?take=10`](https://kennesaw.campuslabs.com/engage/api/discovery/search/organizations?take=10) | `200 OK` | `application/json; charset=utf-8` | None | Full-text search + OData facets across all `544` organizations (*Pre-Law Club*, *Aviation at Kennesaw State University*, *Biomedical Research Society*, *Black Musicians Coalition*, etc.) |
| [`https://kennesaw.campuslabs.com/engage/api/discovery/branch`](https://kennesaw.campuslabs.com/engage/api/discovery/branch) | `200 OK` | `application/json; charset=utf-8` | None | 4 branches: `77246` (*Student-Led Organizations*), `231924` (*Fraternity and Sorority Life*), `231925` (*Departments*), `195259` (*Inactive Branch / club-sports*) |
| [`https://kennesaw.campuslabs.com/engage/events.ics`](https://kennesaw.campuslabs.com/engage/events.ics) | `200 OK` | `text/calendar; charset=utf-8` | None | Standard `VCALENDAR` (`ical.net 4.0`) with `CATEGORIES:Kennesaw Campus` / `Marietta Campus`, `DTSTART`, `DTEND`, `LOCATION`, `SUMMARY`, `DESCRIPTION` |
| [`https://kennesaw.campuslabs.com/engage/events.rss`](https://kennesaw.campuslabs.com/engage/events.rss) | `200 OK` | `application/rss+xml; charset=utf-8` | **`Access-Control-Allow-Origin: *`** | Rolling 100-day public `Event` window (`2026-11-15` through `2027-02-23`) |

- **`robots.txt` & Terms Constraints**: [`https://kennesaw.campuslabs.com/robots.txt`](https://kennesaw.campuslabs.com/robots.txt) specifies `Disallow: /engage/api/`, whereas `/engage/events.ics`, `/engage/events.rss`, and `sitemap.xml` are explicitly published syndication feeds. Furthermore, because `Student`-led `Club` activity is splitting between Anthology Engage, Suitable (SSO-locked), and Instagram/Discord, KSUX should seed its `Club` directory from Engage (`544` orgs) while letting verified `Student` officers claim `Club` profiles and publish `Event`s natively in KSUX.

### 1.3 KSU Master Calendar (`calendar.kennesaw.edu` — Concept3D Localist) — Gold-Standard Public API

[`https://calendar.kennesaw.edu`](https://calendar.kennesaw.edu) runs **Concept3D Localist** (`x-slzr-platform: kennesaw`) and exposes a **100% public, unauthenticated, browser-CORS-enabled (`Access-Control-Allow-Origin: *`)** REST JSON v2 API alongside `.ics` and GeoRSS/xCal feeds:

| Endpoint | HTTP Status | `Content-Type` | CORS / Cache Headers | Verified Payload Shape |
| :--- | :--- | :--- | :--- | :--- |
| [`https://calendar.kennesaw.edu/api/2/events?pp=50&days=30`](https://calendar.kennesaw.edu/api/2/events?pp=50&days=30) | `200 OK` | `application/json; charset=utf-8` | `Access-Control-Allow-Origin: *`, `Cache-Control: max-age=600, public` | `events[].event`: `id`, `title`, `description_text`, `location_name`, `room_number`, `address`, `experience` (`inperson`/`virtual`), `free`, `ticket_url`, `photo_url`, `geo.{latitude,longitude}`, `departments[]`, `filters.event_types[]`, `event_instances[].event_instance.{start,end,all_day}`, `localist_url`, `localist_ics_url` |
| [`https://calendar.kennesaw.edu/api/2/events/filters`](https://calendar.kennesaw.edu/api/2/events/filters) | `200 OK` | `application/json; charset=utf-8` | `Access-Control-Allow-Origin: *`, `max-age=600` | `event_target_audience` (e.g., `Students` `31369705385273`) & 18 `event_types` (`Student Life` `32061222294296`, `Athletics` `32061222228860`, `Career Services` `32061222274178`, `Arts` `32061222273019`, `Academic Calendar & Deadlines` `32061222225277`, `Dining` `37704173385816`, etc.) |
| [`https://calendar.kennesaw.edu/api/2/places?pp=100`](https://calendar.kennesaw.edu/api/2/places?pp=100) | `200 OK` | `application/json; charset=utf-8` | `Access-Control-Allow-Origin: *` | Campus buildings & venues with `display_name`, `address`, `geo.{latitude,longitude}`, and explicit `Campus` classification under `filters.business_type` |
| [`https://calendar.kennesaw.edu/api/2/places/filters`](https://calendar.kennesaw.edu/api/2/places/filters) | `200 OK` | `application/json; charset=utf-8` | `Access-Control-Allow-Origin: *` | Canonical `Campus` filter IDs: **`Kennesaw Campus` (`32503979949580`)** and **`Marietta Campus` (`32503981290035`)** |
| [`https://calendar.kennesaw.edu/calendar.ics`](https://calendar.kennesaw.edu/calendar.ics) | `200 OK` | `text/calendar; charset=utf-8` | No CORS header (`max-age=600, public`) | Full iCalendar `VEVENT` feed |
| [`https://calendar.kennesaw.edu/calendar.xml`](https://calendar.kennesaw.edu/calendar.xml) | `200 OK` | `application/xml; charset=utf-8` | No CORS header (`max-age=600, public`) | RSS 2.0 + `xmlns:geo` + `xmlns:xCal` (`ttl: 120` min) |

- **Rate Limits & `robots.txt`**: [`https://calendar.kennesaw.edu/robots.txt`](https://calendar.kennesaw.edu/robots.txt) sets `Crawl-Delay: 1` and only disallows HTML calendar facet permutations (`/calendar/*?*types*`), leaving `/api/2/*` unrestricted. Varnish caches `/api/2/events` for 10 minutes (`max-age=600`), making a 5–10 minute backend poll completely zero-strain.

---

## 2. Transit (`Shuttle Route` — Big Owl Bus)

### 2.1 Vendor & Discovery
Note that the legacy URL `https://www.kennesaw.edu/parking/big-owl-bus.php` redirects to `https://campus.kennesaw.edu/offices-services/parking/big-owl-bus.php` (`404`); KSU's active pages are [`https://campus.kennesaw.edu/offices-services/parking/`](https://campus.kennesaw.edu/offices-services/parking/) and [`https://campus.kennesaw.edu/offices-services/parking/big-owl-bus/shuttle-routes.php`](https://campus.kennesaw.edu/offices-services/parking/big-owl-bus/shuttle-routes.php).

KSU's live Big Owl Bus tracker is **Passio Technologies (Passio GO!)** at [`https://kennesawstate.passiogo.com/`](https://kennesawstate.passiogo.com/):
- **Passio Agency / System ID**: `66` (`acronymId=66`, `goAuthenticationType: "0"` — zero authentication)
- **Web Tracker Subdomain**: `kennesawstate.passiogo.com`
- **Passio GTFS Agency Username**: `kennesaw` (critical distinction: `passio3.com/kennesawstate/...` returns `404`, whereas `passio3.com/kennesaw/...` returns `HTTP 200`!)

### 2.2 Public GTFS Static & GTFS-Realtime v2.0 Feeds (Recommended Primary Source)

Passio exposes industry-standard **GTFS Static** and **GTFS-Realtime v2.0** (both JSON and binary Protobuf) on `passio3.com` with **wildcard CORS (`Access-Control-Allow-Origin: *`)** and explicit IP rate-limit headers:

| Endpoint | HTTP Status | `Content-Type` | CORS | Rate Limit (`x-ratelimit-limit`) | Verified Payload Details |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [`https://passio3.com/kennesaw/passioTransit/gtfs/google_transit.zip`](https://passio3.com/kennesaw/passioTransit/gtfs/google_transit.zip) | `200 OK` | `application/zip` (`44,798` B) | `Vary: Origin` | `1,200` / window | Contains `agency.txt`, `feed_info.txt` (`20261114–20261215`), `routes.txt` (**11 `Shuttle Route`s**), `stops.txt`, `trips.txt`, `stop_times.txt`, `shapes.txt` (`29.5 KB` route polylines), `calendar.txt` |
| [`https://passio3.com/kennesaw/passioTransit/gtfs/realtime/vehiclePositions.json`](https://passio3.com/kennesaw/passioTransit/gtfs/realtime/vehiclePositions.json) | `200 OK` | `application/json; charset=utf-8` | **`*`** | `6,000` / window | GTFS-RT v2.0 JSON (`header.gtfs_realtime_version: "2.0"`, `timestamp`, `entity[].vehicle` during operating hours; binary Protobuf also live at `/realtime/vehiclePositions`) |
| [`https://passio3.com/kennesaw/passioTransit/gtfs/realtime/tripUpdates.json`](https://passio3.com/kennesaw/passioTransit/gtfs/realtime/tripUpdates.json) | `200 OK` | `application/json; charset=utf-8` | **`*`** | `6,000` / window | Stop-level arrival/departure predictions (Protobuf at `/realtime/tripUpdates`) |
| [`https://passio3.com/kennesaw/passioTransit/gtfs/realtime/serviceAlerts.json`](https://passio3.com/kennesaw/passioTransit/gtfs/realtime/serviceAlerts.json) | `200 OK` | `application/json; charset=utf-8` | **`*`** | `6,000` / window | Route detours & rider alerts (e.g., I-75 vs. Hwy 41 routing on `KM Kennesaw /Marietta`) |

#### Verified Active KSU `Shuttle Route`s in `routes.txt` & `getRoutes=2`
1. `74760` (`KM`) — **KM Kennesaw /Marietta** (`#636363`, inter-campus connector between `Kennesaw` and `Marietta`)
2. `74761` — **Kennesaw Loop** (`#6BAED6`, `Kennesaw` Campus)
3. `74764` — **Marietta Loop** (`#17BECF`, `Marietta` Campus)
4. `74763` — **Big Shanty Loop** (`#393B79`, `Kennesaw` Campus)
5. `2995` — **West Campus** (`#8C564B`, `Kennesaw` Campus)
6. `2998` — **Chastain Pointe / Arts** (`#BCBD22`, `Kennesaw` Campus)
7. `50227` — **Skip Spann / Frey Road** (`#000000`, `Kennesaw` Campus)
8. `74762` — **Economy Route** (`#8C564B`)
9. `71987` — **Shuttle parking Route** (`#843C39`)
10. `75303` — **Kennesaw Shopping** (`#2CA02C`, `Kennesaw` Campus)
11. `64025` — **Marietta Shopping** (`#CE6DBD`, `Marietta` Campus)

### 2.3 Passio GO JSON RPC Endpoints (`kennesawstate.passiogo.com/mapGetData.php`)
All endpoints below return `HTTP 200 OK` with `Access-Control-Allow-Origin: *` (note `Content-Type` header is `text/html; charset=UTF-8` even though the body is valid JSON):
- **Routes**: `POST https://kennesawstate.passiogo.com/mapGetData.php?getRoutes=2` with form body `json={"systemSelected0":"66","amount":1}` -> 11 route objects (`myid`, `name`, `shortName`, `color`, `outdated` service flag).
- **Stops & Polylines**: `POST https://kennesawstate.passiogo.com/mapGetData.php?getStops=2` with `json={"s0":"66","sA":1}` -> **35 stops** (`id`, `stopId`, `routeId`, `position`, `name`, `latitude`, `longitude`, `radius`), `routePoints` (segmented lat/lng arrays per route), and `routeSchedules`.
- **Live Vehicles**: `POST https://kennesawstate.passiogo.com/mapGetData.php?getBuses=2` with `json={"s0":"66","sA":1}` -> active buses (`busId`, `busName`, `latitude`, `longitude`, `calculatedCourse`, `routeId`, `route`, `color`, `paxLoad`, `totalCap`, `outOfService`); off-hours returns `{"buses":{"-1":[{"-1":[]}]}}`.
- **Stop ETAs**: `GET https://kennesawstate.passiogo.com/mapGetData.php?eta=3&deviceId=0&stopIds=...&routeId=...`.

---

## 3. Study Rooms (`Study Room`, `Study Session`)

### 3.1 Springshare LibCal Architecture (`kennesaw.libcal.com`, `iid=22`)
[`https://www.kennesaw.edu/library/`](https://www.kennesaw.edu/library/) (`301` -> [`https://campus.kennesaw.edu/offices-services/library/`](https://campus.kennesaw.edu/offices-services/library/)) links `Study Room` reservations from [`/offices-services/library/space-and-technology/study-room-reservations.php`](https://campus.kennesaw.edu/offices-services/library/space-and-technology/study-room-reservations.php) to **Springshare LibCal** (`iid: 22`):

| `Campus` & Facility | Public Booking Page | LibCal IDs | Verified Room Inventory |
| :--- | :--- | :--- | :--- |
| **`Kennesaw` — Horace W. Sturgis Library** | [`https://kennesaw.libcal.com/reserve/studyroomsK`](https://kennesaw.libcal.com/reserve/studyroomsK) | `lid=10524`, `gid=19509` | **15 `Study Room`s** (capacities 4–10; e.g., `eid=74084` *Room 114 Seminar/Study*, `eid=74094–74099` *Rooms 126–131 Collaborative Technology Group Study*, `eid=74092/74091` *Rooms 302A/302B*) |
| **`Marietta` — Lawrence V. Johnson Library** | [`https://kennesaw.libcal.com/reserve/studyroomsM`](https://kennesaw.libcal.com/reserve/studyroomsM) | `lid=10526`, `gid=19510` | **32 `Study Room`s** (capacities 2–8+; e.g., `eid=125186` *133A*, `eid=125223` *133B*, `eid=125224/125225` *134A/134B*, `eid=74100` *Room 203 Collaborative Technology*) |
| **`Marietta` — KSU AI Lab** | [`https://kennesaw.libcal.com/spaces?lid=24727`](https://kennesaw.libcal.com/spaces?lid=24727) | `lid=24727` | Specialized `Marietta` AI Lab spaces |

### 3.2 Unauthenticated Endpoints vs. NetID/Duo Auth Gate

1. **Public Library & `Study Room` Hours JSON Widget (`CORS: *`)**:
   - `GET` [`https://kennesaw.libcal.com/api_hours_today.php?iid=22&lid=0&format=json&systemTime=0`](https://kennesaw.libcal.com/api_hours_today.php?iid=22&lid=0&format=json&systemTime=0)
   - Returns `HTTP/2 200`, `application/json; charset=utf-8`, **`Access-Control-Allow-Origin: *`** with daily open/close times across `KSU University Libraries` (`lid=2509`), `Study Rooms` (`lid=5013`), `Seminar Spaces` (`lid=5033`), `Library Equipment` (`lid=5034`), and `Johnson and Sturgis Library` (`lid=16228`).
2. **Unauthenticated Live 30-Minute `Study Room` Availability Grid (`POST /spaces/availability/grid`)**:
   - `POST https://kennesaw.libcal.com/spaces/availability/grid`
   - Required headers: `Referer: https://kennesaw.libcal.com/reserve/studyroomsK` (or `studyroomsM`) and `X-Requested-With: XMLHttpRequest`.
   - Form body: `lid=10524&gid=19509&eid=-1&seat=0&seatId=0&zone=0&start=2026-11-16&end=2026-11-17&pageIndex=0&pageSize=50`
   - Returns `HTTP/2 200`, `content-type: application/json` (no `Access-Control-Allow-Origin` header -> server-side only).
   - **Payload shape** (`406` slots tested for `2026-11-16`):
     ```json
     {
       "slots": [
         {
           "start": "2026-11-16 08:00:00",
           "end": "2026-11-16 08:30:00",
           "itemId": 74085,
           "checksum": "df7b31e9514cf2fce91a113571ad2118",
           "className": "s-lc-eq-checkout"
         },
         {
           "start": "2026-11-16 10:00:00",
           "end": "2026-11-16 10:30:00",
           "itemId": 74085,
           "checksum": "db68869d71f27ff185d4089b784e3fd5"
         }
       ],
       "bookings": [],
       "isPreCreatedBooking": false,
       "windowEnd": "..."
     }
     ```
     Slots **with** `"className": "s-lc-eq-checkout"` are booked/unavailable; slots **without** `className` are **open and bookable**. Room names, `eid`s, and capacities are embedded in the parent HTML (`resources.push({...})`).
3. **Auth Gate (`POST /spaces/availability/booking/add` -> LibAuth SSO)**:
   - Completing a reservation redirects to Springshare LibAuth / KSU SAML SSO (`kennesaw.libapps.com` / NetID + Duo).
4. **Crawl / Rate Constraints**:
   - [`https://kennesaw.libcal.com/robots.txt`](https://kennesaw.libcal.com/robots.txt) declares `Crawl-delay: 10` and `Disallow: /` for general web crawlers. For hackathon/MVP scale, KSUX should cache `/spaces/availability/grid` server-side with a conservative TTL (e.g., 2–5 minutes on demand) and never hammer LibCal; for long-term production, KSU Library Systems can issue a read-only LibCal v1.1 OAuth2 Client Credentials key (`/1.1/space/item` & `/1.1/space/nickname`).

---

## 4. Parking (`Parking Lot`, `Parking Report`, `Meetup Spot`)

### 4.1 Static `Parking Lot` Directories, Permit Classifications & GeoJSON/XML Polygons — Public

1. **Permit Classifications & Rates** ([`https://campus.kennesaw.edu/offices-services/parking/parking-information/student-permits.php`](https://campus.kennesaw.edu/offices-services/parking/parking-information/student-permits.php), `HTTP 200 OK`):
   - Scrape-safe HTML tables listing official 2026–2027 `Parking Lot` permit classifications and semester/annual rates: `Residential Permits`, `Central Deck or Lots` ($110/sem), `East Deck or Lots` ($110), `West Deck or Lots` ($110), `South Lot` ($110), `East Economy Lots` ($90), `Town Point Economy Lot` ($90), `Gutenberg Economy Lot` ($90), and `Shuttle Lots` ($55).
   - Official vector PDF maps (`HTTP 200 OK`, `application/pdf`):
     - `Kennesaw`: [`https://campus.kennesaw.edu/offices-services/parking/docs/kennesaw-parking-map.pdf`](https://campus.kennesaw.edu/offices-services/parking/docs/kennesaw-parking-map.pdf) (`Last-Modified: 2026-09-28`, `1.21 MB`)
     - `Marietta`: [`https://campus.kennesaw.edu/offices-services/parking/docs/marietta-parking-map.pdf`](https://campus.kennesaw.edu/offices-services/parking/docs/marietta-parking-map.pdf) (`Last-Modified: 2026-08-10`, `960 KB`)
2. **Interactive Campus Map Structured XML & GeoJSON (`maps.kennesaw.edu`)**:
   - [`https://maps.kennesaw.edu/`](https://maps.kennesaw.edu/) runs **CampusTours AnyTour** (`https://maps.kennesaw.edu/any.xml`, `https://maps.kennesaw.edu/settings-embedded.json`) and serves its complete campus dataset unauthenticated at:
     - `GET` [`https://maps.kennesaw.edu/xml/CL_kennesaw.xml`](https://maps.kennesaw.edu/xml/CL_kennesaw.xml) (`HTTP 200 OK`, `Content-Type: text/xml`, `1,749,017` bytes, `Last-Modified: 2026-07-14`, no CORS header -> server-side parse/seed).
   - **Verified contents inside `CL_kennesaw.xml`**:
     - **`72` `<BLD>` `Parking Lot` & deck records** and **`242` total parking-tagged elements** across both `Kennesaw` (`Central Parking Deck`, `East Parking Deck`, `North Parking Deck`, `West Parking Deck`, `Town Point Economy Lot`, `East Economy Lot`, `West Economy Lot`, `3305 Shuttle Lot`, `KSU Center Lot`, `Austin Residence Lot`, `Campus Loop Residential Lot`, `Student Center Visitor Lot`) and `Marietta` (`West Deck`, `Shuttle Lot`, `Lots A, B, B1, B2, C, D, E, F, G, H, J, L, P21, V2, Z`, `East Residence Lot`, `West Residence Lot`, `South Housing Lot`).
     - **`273` `<POLY>` polygons**, **`65` `<GPOLY>` WGS84 GeoJSON polygons** (including active construction zones like `UNDER CONSTRUCTION - Summit Parking Lot`), **`233` `<GPNT>` GeoJSON points**, **`301` `<BLD>` campus buildings**, **`122` `<ADDR>` street addresses**, and **`40` `<ULAY>` map layers** (`Student Parking`, `Faculty/Staff Parking`, `Visitor Parking`, `Dining Hall`, `Library`, `Recreation Center`, `Accessible Entrances`).
     - Also provides authoritative coordinates for well-lit campus plazas, student centers, and police/Talon One locations to pre-seed safe Marketplace **`Meetup Spot`s** on both `Kennesaw` and `Marietta`!
   - *(Note on ArcGIS)*: Querying `arcgis.com/sharing/rest/search` confirmed `City of Kennesaw GIS` publishes municipal downtown parking (`DowntownParking/FeatureServer`), whereas KSU's own campus GIS lives in `maps.kennesaw.edu/xml/CL_kennesaw.xml` and `calendar.kennesaw.edu/api/2/places`.

### 4.2 Live Deck Occupancy Counters — None Public (`Student` `Parking Report`s Required)

- **KSU Early Semester Parking Guide** ([`https://campus.kennesaw.edu/offices-services/parking/parking-information/parking-pulse.php`](https://campus.kennesaw.edu/offices-services/parking/parking-information/parking-pulse.php), `HTTP 200`): Despite the filename `parking-pulse.php`, the page contains **zero live telemetry, iframes, or occupancy APIs**. Instead, it displays static scheduled class-enrollment charts by day/hour (noting peak demand Tue/Thu 11:00 AM–3:00 PM and Mon/Wed 10:00 AM–1:00 PM) and advises drivers that lower deck levels fill first.
- **T2 Flex Parking Portal** ([`https://kennesaw.t2hosted.com/cmn/index.aspx`](https://kennesaw.t2hosted.com/cmn/index.aspx)): Immediately returns `HTTP 302` into a **Queue-it virtual waiting room** (`https://permitlobby.t2hosted.com/?c=t2systems&e=kennesawpersistent...`) followed by KSU NetID/Duo SSO, handling only permit sales, vehicle plate registration, and citation appeals—not real-time space counts.
- **Architectural Verdict**: Live `Parking Lot` fullness and about-to-open spot alerts **cannot** be scraped or polled from KSU; they **must** be crowdsourced from verified `Student`s submitting `Parking Report`s in KSUX, optionally cold-started using each `Campus`'s hourly class-meeting density computed from Banner 9 (`srs-owlexpress.kennesaw.edu`).

---

## 5. Dining & Course Schedules (`Course Hub`)

### 5.1 KSU Dining (`The Commons`, `Stingers`, & 15 Retail Venues) — Public Nutrislice JSON + HTML Hours

[`https://www.kennesaw.edu/dining/`](https://www.kennesaw.edu/dining/) (`301` -> [`https://campus.kennesaw.edu/offices-services/dining/`](https://campus.kennesaw.edu/offices-services/dining/)) publishes all operating hours on [`hours-locations.php`](https://campus.kennesaw.edu/offices-services/dining/hours-locations.php) and links all menus to **Nutrislice** ([`https://ksu.nutrislice.com/menu/`](https://ksu.nutrislice.com/menu/)).

#### Verified Nutrislice Public JSON Endpoints (`ksu.api.nutrislice.com`)
| Endpoint | HTTP Status | `Content-Type` | CORS | Verified Payload Summary |
| :--- | :--- | :--- | :--- | :--- |
| [`https://ksu.api.nutrislice.com/menu/api/schools/?format=json`](https://ksu.api.nutrislice.com/menu/api/schools/?format=json) | `200 OK` | `application/json` (`37.3 KB`) | None (`Vary: Accept, Cookie, origin` — server-side fetch required) | **All 17 KSU dining venues**, slugs, IDs, and `active_menu_types[]`:<br>• **`the-commons`** (`id: 6196`, *The Commons - Dining Hall*, `Kennesaw`): `apron-strings-breakfast`, `apron-stings-lunch` *(sic)*, `apron-strings-lunch-dinner`, `globe-trotters`, `cornerstone-bakery` (*Stone Mill Bakery*), `stone-mill-grind` (*The Grind*), `campus-green`, `piatti`, `miso-caliente-2`, `highway-41`<br>• **`stingers`** (`id: 6192`, *Stingers - Dining Hall*, `Marietta`): `down-home-breakfast`, `down-home-lunch`, `down-home-dinner`, `the-grill`, `blueprint-deli`, `world-fare` (*Revolution Pizza*), `farm-basket`, `slice-of-pi`<br>• **15 Retail Venues**: `j-building` (*Stacks*, `Marietta`), `chick-fil-a`, `cinnabon`, `dunkin`, `high-point-cafe`, `high-roller-sushi`, `hissho`, `jamba`, `mcalisters-deli`, `moes`, `on-the-fly`, `panda-express`, `starbucks-social-sciences-building`, `starbucks-student-center`, `the-local-spot` |
| [`https://ksu.api.nutrislice.com/menu/api/weeks/school/the-commons/menu-type/apron-stings-lunch/2026/11/16/?format=json`](https://ksu.api.nutrislice.com/menu/api/weeks/school/the-commons/menu-type/apron-stings-lunch/2026/11/16/?format=json) | `200 OK` | `application/json` | None | 7-day `days[]` array with `date`, `menu_items[]`, station headers, `food.{name, description, ingredients, icons, rounded_nutrition_info}` (live-verified dishes for `2026-11-15`/`16`: *Baked Chicken w/ Roasted Red Pepper Cream Sauce*, *Chicken Pot Pie* at `The Commons`; *Fried Pork Chops*, *Creamy Mushroom Chicken* at `Stingers`; full calorie/macro breakdowns on retail menus like `chick-fil-a`, `cinnabon`, `dunkin`) |

- **Hours, Rates & Break Closures**: Because `operating_days` in KSU's Nutrislice school config is `null`, KSUX should pair Nutrislice's live daily station menus with the clean semantic HTML schedule on [`https://campus.kennesaw.edu/offices-services/dining/hours-locations.php`](https://campus.kennesaw.edu/offices-services/dining/hours-locations.php) (`HTTP 200 OK`), which lists exact semester hours, door/Dining Dollar entry rates ($9.50–$14.00), construction closures (*Carmichael Student Center Starbucks*), and holiday/break schedules (*Thanksgiving Break Nov 21–28*, *Winter Break Dec 15–Jan 9*). Mobile ordering (`grubhub.php` / TransAct) requires proprietary app login and is not publicly queryable.

### 5.2 Course Schedules & `Course Hub` Onboarding

#### A. Unexpected Major Win: Public Master Course Schedule JSON (`srs-owlexpress.kennesaw.edu`) & Simple Syllabus (`kennesaw.simplesyllabus.com`)
Linked from [`https://campus.kennesaw.edu/current-students/registrar/registration/index.php`](https://campus.kennesaw.edu/current-students/registrar/registration/index.php), KSU's **Ellucian Banner 9 Student Registration SSB** (`mode=search`) is **100% publicly readable without authentication** (`HTTP 200 OK`, `application/json;charset=UTF-8`, no wildcard CORS -> server-side sync using a standard `JSESSIONID` cookie jar):

1. **List Terms**: `GET` [`https://srs-owlexpress.kennesaw.edu/StudentRegistrationSsb/ssb/classSearch/getTerms?searchTerm=&offset=1&max=10`](https://srs-owlexpress.kennesaw.edu/StudentRegistrationSsb/ssb/classSearch/getTerms?searchTerm=&offset=1&max=10) -> Returns `202701` (*Spring Semester 2027*), `202608` (*Fall Semester 2026*), etc.
2. **List Campuses**: `GET .../classSearch/get_campus?searchTerm=&term=202701&offset=1&max=20` -> Canonical Banner `Campus` codes: **`"A"` (`Kennesaw Campus`)**, **`"M"` (`Marietta Campus`)**, `"O"` (`KSU Online`), `"C"` (`KSU Center`), `"GML"` (`eCore`), etc.
3. **Bind Term in Session & Query Sections**:
   - `POST https://srs-owlexpress.kennesaw.edu/StudentRegistrationSsb/ssb/term/search?mode=search` (`term=202701`)
   - `GET https://srs-owlexpress.kennesaw.edu/StudentRegistrationSsb/ssb/searchResults/searchResults?txt_term=202701&pageOffset=0&pageMaxSize=500` (call `POST /classSearch/resetDataForm` before changing filter params on the same `JSESSIONID`).
   - **Live Verified Scale & Schema**: **`7,333` active sections for Spring 2027 (`202701`)** (and full Fall 2026 `202608` catalog, e.g., `246` `CS` sections). Each section JSON includes `courseReferenceNumber` (`CRN`, e.g., `"83190"`), `subjectCourse` (`"CS3305"`), `sequenceNumber` (`"01"`), `courseTitle` (`"Data Structures"`), `campusDescription` (`"Marietta Campus"` / `"Kennesaw Campus"`), `enrollment`, `maximumEnrollment`, `seatsAvailable`, `waitCount`, `faculty[].{displayName, emailAddress}`, and `meetingsFaculty[].meetingTime.{beginTime, endTime, building, buildingDescription, room, monday..sunday, startDate, endDate}`!
4. **Public Syllabus Library API**:
   - `GET` [`https://kennesaw.simplesyllabus.com/api2/doc-library-search?page=1&page_size=25`](https://kennesaw.simplesyllabus.com/api2/doc-library-search?page=1&page_size=25) -> `HTTP/2 200`, `application/json`, `cache-control: public`, exposing **`26,243` public KSU syllabi** searchable by course code/CRN/instructor—ideal for enriching `Course Hub` pages and grounding `Scrappy` answers!

#### B. Personal `Student` Schedule Export (`.ics`) from Owl Express & D2L Brightspace
- **Direct Authentication Wall**:
  - [`https://owlexpress.kennesaw.edu/`](https://owlexpress.kennesaw.edu/) -> `302` to `/ssomanager/saml/login?relayState=/c/auth/SSB` -> Microsoft Entra ID SAML (`https://login.microsoftonline.com/45f26ee5-f134-439e-bc93-e6c7e33d61c2/saml2`) + Duo MFA.
  - [`https://kennesaw.view.usg.edu/`](https://kennesaw.view.usg.edu/) (KSU's USG-hosted **D2L Brightspace** LMS; note `https://d2l.kennesaw.edu` redirects to `www.kennesaw.edu/d2l/` `404`, while [`https://campus.kennesaw.edu/current-students/d2l/`](https://campus.kennesaw.edu/current-students/d2l/) links to `https://kennesaw.view.usg.edu/d2l/login`) -> `302` to `/d2l/lp/auth/saml/initiate-login` -> same Microsoft Entra ID SAML tenant + Duo MFA.
- **`.ics` Export Capabilities & Caveats**:
  1. **Owl Express / Banner 9 Registration (`srs-owlexpress.kennesaw.edu`)**: Once authenticated under *Registration -> View Registration Information*, Banner 9's `registrationView` module (`window.EmailView` / `a#email-button` verified in `registrationView-mf-491e0693916f4450dc2ac7e5cb376168.js`) allows a `Student` to email their registered schedule (which attaches a standard `.ics` file of weekly class `VEVENT`s). However, KSU Registrar FAQs (`registration/index.php`) do not document a prominent one-click `.ics` download workflow, and the email round-trip adds onboarding friction.
  2. **D2L Brightspace (`kennesaw.view.usg.edu`)**: Supports Brightspace's standard *Calendar -> Settings -> Enable Calendar Feeds -> Subscribe* (personal `.ics` URL / `.ics` export), **but** D2L calendar feeds primarily contain **assignment, quiz, and discussion deadlines** rather than weekly lecture meeting blocks (`RRULE` + building/room) unless an instructor manually populates class meetings in D2L.
- **Recommended `Course Hub` Onboarding Design**:
  1. **Primary (Fastest — 10 seconds, zero file export)**: Pre-ingest all `7,333` Banner 9 sections from `srs-owlexpress.kennesaw.edu` into KSUX's database. During onboarding, let a `Student` search by course (`CS 3305`) or paste their 5-digit CRNs (`83190, ...`) from Owl Express to join exact `Course Hub`s with full `Campus`, building/room, instructor, and meeting-time hydration automatically!
  2. **Secondary (Power-`Student` option)**: Accept `.ics` file upload (from Banner 9 schedule email) and optional D2L Brightspace `.ics` feed URL (to surface personal assignment due dates alongside `Course Hub` `Study Session`s).

---

## 6. Summary: Public Ingestion vs. `Student` Crowdsourcing & Onboarding

| Data Need in KSUX | Source Verdict | Actionable Architecture Decision |
| :--- | :--- | :--- |
| **Campus `Event`s (`Kennesaw` & `Marietta`)** | **Public API** | Server-sync Localist (`calendar.kennesaw.edu/api/2/events` + `/places`) + Anthology Engage (`kennesaw.campuslabs.com/engage/api/discovery/event/search` & `events.rss`); supplement with `Student`- and `Club`-created `Event`s in KSUX because `owllife.kennesaw.edu` now redirects to SSO-gated Suitable (`app.suitable.co/institution/10219`). |
| **`Club` Directory (`544` orgs)** | **Public API + `Student` Claim** | Seed all `544` `Club` profiles from `kennesaw.campuslabs.com/engage/api/discovery/organization`; let verified `Student`s create/claim `Club`s and attach `Group Chat`s. |
| **Big Owl Bus `Shuttle Route`s & Live Buses** | **Public GTFS + GTFS-RT API** | Seed `11` routes, `35` stops, and polylines from `passio3.com/kennesaw/passioTransit/gtfs/google_transit.zip` + `mapGetData.php?getStops=2`; poll live vehicles/ETAs/alerts from `passio3.com/kennesaw/passioTransit/gtfs/realtime/*.json` (`CORS: *`, `6,000` req limit). |
| **Library `Study Room` Availability (`47` rooms)** | **Public Read / SSO Write** | Read hours via `kennesaw.libcal.com/api_hours_today.php` (`CORS: *`) and cache 30-min availability slots server-side via `POST kennesaw.libcal.com/spaces/availability/grid` (`lid=10524` Sturgis, `lid=10526` Johnson); host `Study Session`s in KSUX and deep-link to `/space/{eid}` for NetID/Duo booking checkout. |
| **`Parking Lot` Polygons & Safe `Meetup Spot`s** | **Public XML/GeoJSON** | Seed `Parking Lot` boundaries, permit tiers, and campus building/plaza `Meetup Spot`s from `maps.kennesaw.edu/xml/CL_kennesaw.xml`, `student-permits.php`, and `calendar.kennesaw.edu/api/2/places`. |
| **Live `Parking Lot` Fullness** | **No Public Feed — Crowdsource** | **Must be crowdsourced via `Student` `Parking Report`s** (with optional cold-start fullness priors derived from Banner 9 `srs-owlexpress.kennesaw.edu` hourly building/campus enrollment). |
| **Dining Menus & Hours (`The Commons`, `Stingers`, `15` Retail)** | **Public JSON + HTML** | Sync daily station menus, ingredients, allergens, and nutrition server-side from `ksu.api.nutrislice.com/menu/api/...` + operating/holiday hours from `campus.kennesaw.edu/offices-services/dining/hours-locations.php`. |
| **`Course Hub` Directory & `Student` Schedule** | **Public Catalog API + `Student` Input** | Sync all `7,333` semester sections from Banner 9 (`srs-owlexpress.kennesaw.edu`) + `26,243` syllabi (`kennesaw.simplesyllabus.com`); onboard `Student`s via instant CRN/course typeahead plus optional `.ics` upload. |
| **`Judge Demo Mode` & `Scrappy` Context** | **100% Grounded in Real KSU Data** | Every module in `Judge Demo Mode` and `Scrappy`'s RAG/tool layer can use real KSU `Shuttle Route`s, `Study Room`s, `Parking Lot`s, `The Commons`/`Stingers` menus, `Club`s, `Event`s, and `7,333` real KSU courses without needing NetID credentials. |
