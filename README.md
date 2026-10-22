# My Paushe — starter full-stack MVP

This is a runnable foundation for the My Paushe service marketplace:
- React Native / Expo mobile app
- Express REST API
- PostgreSQL + PostGIS schema
- Service discovery, booking creation, provider chat starter
- M-Pesa payment integration placeholders and QR verification design

## Requirements
- Node.js 20+
- PostgreSQL 15+ with PostGIS
- Expo Go or Android/iOS simulator

## Run the backend
```bash
cd backend
cp .env.example .env
npm install
# Create a database, enable PostGIS, then run schema.sql
psql "$DATABASE_URL" -f schema.sql
npm run dev
```

### Use Supabase as the PostgreSQL/PostGIS database
The backend connects with the PostgreSQL driver already installed (`pg`); the
Supabase JavaScript packages are not a database connection URL and are not needed
for this backend. In the Supabase project dashboard, open **Connect** and copy a
PostgreSQL connection URI (use the Session pooler URI if the direct connection is
not reachable from your network). Put it in `backend/.env`:

```env
DATABASE_URL=postgresql://...your-project-connection-uri...
```

Keep the database password private and URL-encode any reserved characters in it.
Then run `schema.sql` against that project using the Supabase SQL Editor (paste
and run the schema contents), or from a machine with `psql`:

```bash
psql "$DATABASE_URL" -f schema.sql
```

The schema enables PostGIS with `CREATE EXTENSION IF NOT EXISTS postgis`. For
Supabase, use the **Session pooler** connection string (port 5432) for this
persistent Express backend. Percent-encode reserved password characters and
remove the square brackets around Supabase's `[YOUR-PASSWORD]` placeholder.
Download `prod-ca-2021.crt` from **Database Settings → SSL Configuration**, save
it as `backend/certs/prod-ca-2021.crt`, and set
`DATABASE_SSL_CA=certs/prod-ca-2021.crt` in `backend/.env`. The backend verifies
the server certificate and hostname; do not disable TLS certificate verification.

You can apply and verify the schema from the backend directory with
`npm run db:setup`. Start the API with `npm run dev` and verify
`http://localhost:4000/api/health` returns
`{"ok":true,"app":"My Paushe API","database":"connected"}`.

## Run the mobile app
In a second terminal:
```bash
cd mobile
npm install
cp .env.example .env
npx expo start
```
Set `EXPO_PUBLIC_API_URL` to your computer's LAN IP, e.g. `http://192.168.1.20:4000`.
Do not use `localhost` on a physical phone.

## Run the business-owner app
The companion Expo app is in `business/` and runs independently from the customer
app. It supports owner email/password accounts, business profiles and map
coordinates, Till details, editable services/menu/fuel prices, booking requests,
and customer conversations.

```bash
cd business
npm install
cp .env.example .env
npx expo start
```

Set `EXPO_PUBLIC_API_URL` to the same API used by the customer app. For a
physical phone, use the computer's LAN address rather than `localhost`. Owners
can use their current GPS position for a map point or enter the coordinates
manually. New listings are hidden from customers until verified; an operator
must approve them by setting the provider's `verified` field after review.
Owners can then publish and edit offerings in the owner app. Fuel grades and
prices are listed as offerings, and restaurant menu items use the same
price-bearing offerings. Till details are displayed for direct payment outside
the app; the apps do not confirm Till payments or mark bookings paid. Owner
registration requires choosing one business type (garage/mechanic, fuel
station, car wash, restaurant, or B&B/accommodation); the account is limited to
one business listing of that type. Use a separate owner account for a different
business type. Customers can send a dated reservation request to any provider;
the provider confirms or declines it in the owner app. Restaurant menus and
prices are displayed separately from table reservation requests.

Choose **Explore app demo** on the owner sign-in screen to preview the dashboard,
business editor, offerings, booking requests, and messaging without an account.
The demo uses sample data, keeps edits only in memory, and makes no API writes.

Apply the updated `backend/schema.sql` before using the owner endpoints. An owner
must register through the business app; customer accounts cannot be promoted by
the owner signup route. Provider API routes verify the stored provider role and
registered business type, enforce one listing per owner, and scope all
listing, offering, booking, and message operations to that account's business.
Business conversations are shared with the customer app and restricted to the
participants.

## Deploy the web apps and API
The root `render.yaml` defines a Render Blueprint for the API and both static
Expo web apps. Before deployment:

1. Rotate any database or payment-provider credentials previously shared
   outside a private secrets manager. Never commit real credentials or send
   them in chat.
2. Create a private GitHub repository, verify `.env` files and build output are
   excluded, and push this project to its default branch.
3. In Render, create a Blueprint from that repository and use the root
   `render.yaml`. Enter the rotated PostgreSQL Session Pooler URI for
   `DATABASE_URL`. Set `CLIENT_ORIGIN` to the exact HTTPS origins of both
   deployed frontend sites, comma-separated.
4. Upload Supabase's trusted CA certificate as the Render secret file
   `/etc/secrets/prod-ca-2021.crt`. Do not disable certificate verification.
5. After Render assigns the API URL, set `EXPO_PUBLIC_API_URL` to that HTTPS
   URL for both static sites and redeploy them. Confirm `/api/health` is healthy,
   then test owner signup, a customer reservation, and owner replies.
6. Apply and verify `backend/schema.sql` against the production database over
   the trusted connection before opening registration to real users.

The `sync: false` Blueprint values are private configuration prompts and are
not stored in this repository. The API health check requires the database, so
the backend will not become healthy until its URL and CA secret file are
configured. This deploys the web apps; publishing Android/iOS builds to app
stores is a separate process.

## Configure Google sign-in
Create Google OAuth client IDs in Google Cloud Console for the web app and any native
platforms you plan to use. Add the matching IDs to `mobile/.env` as
`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, and
`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`. Add the same IDs, comma-separated, to
`backend/.env` as `GOOGLE_CLIENT_IDS`. For local web development, authorize the
origin `http://localhost:8081` on the web OAuth client. Rebuild native apps after
changing OAuth IDs or the app scheme. The Google sign-in button stays disabled on
platforms without a client ID.

## Configure live Nairobi traffic
The Traffic reports screen uses Google's live traffic layer, centered on Nairobi.
Create separate Google Maps Platform API keys and add them to `mobile/.env`:
- `EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY`: enable Maps JavaScript API and restrict the
  key to authorized website referrers.
- `GOOGLE_MAPS_ANDROID_API_KEY`: enable Maps SDK for Android and restrict the key
  to the Android app package and signing certificate.
- `GOOGLE_MAPS_IOS_API_KEY`: enable Maps SDK for iOS and restrict the key to the
  iOS app bundle identifier.

Enable billing and restart Expo after setting the web key. Rebuild the native app
after setting or changing Android/iOS keys. Google only displays live traffic
where its data is available; the map cannot guarantee traffic details on every
street or replace navigation instructions.

## Nearby services and distance
The app requests foreground location permission when a customer chooses **Find
services near me**. Verified providers with saved PostGIS coordinates are sorted
by straight-line distance, shown on the map, and given a Google Maps directions
link. Customers can also browse/search without granting location; those results
are not distance-sorted. Location access requires a secure origin (HTTPS in
production; localhost is allowed for local web development).

Service locations come from the app's verified `providers` records, not an
automatic Google Places directory. Add each provider's correct map point to the
`location` geography column and its active offerings to `services`; records
without coordinates cannot be shown as nearby or given a distance. Google Maps
provides driving directions; the displayed distance is a straight-line estimate.

## Important production notes
- Payment endpoints are deliberately not marked paid based on a client response. Integrate M-Pesa Daraja STK Push and validate signed/verified callbacks on the server.
- QR codes must contain an opaque, short-lived server-issued token, not payment secrets or a user-editable amount.
- Live traffic is supplied by Google Maps; coverage, refresh timing, and road detail vary by location.
- Authentication and customer-scoped authorization are implemented for email/password and Google ID tokens. Add rate limiting, audit logs, and privacy/retention policies before public launch.
- Airbnb-like accommodation reservations need host inventory, date availability, cancellation rules, and any applicable licensing/compliance checks.
