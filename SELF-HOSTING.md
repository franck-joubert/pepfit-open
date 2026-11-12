# Bring your own API keys

The libre edition ships **no API credentials** and talks to **no pepfit server**. To connect Whoop, Withings or Polar
you create your own (free) developer application with each provider and give its credentials to the app. Everything
then happens on your phone: the OAuth login, the token exchange, the token refresh and the data sync.

Health Connect, Bluetooth heart-rate straps, GPX, Hevy CSV and Fitatu imports need no key.

## Where to enter the credentials

**Recommended: in the app.** Settings › Connections › **My API credentials**: pick the provider, paste the client ID,
the client secret and the redirect URL, tap Save. They are stored in the Android Keystore-backed secure storage
(`expo-secure-store`), never in the database and never in a backup. "Forget these credentials" removes them.
Tapping *Connect* on a provider without credentials opens this screen.

**Optional: at build time, for your own APK only.** The app reads these variables when the JavaScript bundle is built
and uses them as the initial values of the screen above:

```bash
EXPO_PUBLIC_WHOOP_CLIENT_ID=...    EXPO_PUBLIC_WHOOP_CLIENT_SECRET=...    EXPO_PUBLIC_WHOOP_REDIRECT_URI=pepfitopen://whoop
EXPO_PUBLIC_WITHINGS_CLIENT_ID=... EXPO_PUBLIC_WITHINGS_CLIENT_SECRET=... EXPO_PUBLIC_WITHINGS_REDIRECT_URI=https://example.org/pepfit/withings.html
EXPO_PUBLIC_POLAR_CLIENT_ID=...    EXPO_PUBLIC_POLAR_CLIENT_SECRET=...    EXPO_PUBLIC_POLAR_REDIRECT_URI=pepfitopen://polar
```

> ⚠ `EXPO_PUBLIC_*` values are written **in clear text inside the APK**. Never use them for an APK you share or
> publish (F-Droid, a release page…): anyone could extract your client secret. A public build must leave them empty,
> and each user enters their own credentials in the app.

Why the in-app screen is the default: none of the three APIs supports PKCE, so the token exchange needs the client
secret. A secret embedded in a public APK is no longer secret, and Whoop's developer terms forbid publishing it. With
one application per user, the secret only ever lives on its owner's phone, and each user stays within their own API
quota.

## Redirect URL

The redirect URL must be declared **exactly the same** in the provider's dashboard and in the app.

- `pepfitopen://whoop` and `pepfitopen://polar` return straight to the app (custom scheme declared in `app/app.json`).
- Withings only accepts an `https://` URL that it can reach. Host the static page [`relais/retour.html`](relais/retour.html)
  on any HTTPS server you control (GitHub Pages, Codeberg Pages, your own nginx…), for example as
  `https://example.org/pepfit/withings.html`, and use that URL. The page only forwards `code`, `state` and `error` to
  `pepfitopen://withings`; nothing is stored. The provider is taken from `?provider=` or from the file name.
- You may use the same relay page for Whoop or Polar too (`whoop.html`, `polar.html`) if their dashboard refuses the
  custom scheme.

No token relay is needed: refresh happens on the phone with your own credentials. If you prefer to keep the client
secret off the phone, you can put a small self-hosted proxy in front of the token endpoint, but the app does not ship
one.

## Whoop

1. Sign in at <https://developer-dashboard.whoop.com> with your Whoop account and create a team, then an app.
2. Scopes: `read:recovery`, `read:cycles`, `read:sleep`, `read:workout`, `read:profile`, `read:body_measurement`. The
   app also requests `offline` to get a refresh token.
3. Redirect URL: `pepfitopen://whoop` (or your relay page).
4. Copy the Client ID and Client Secret into the app.

Notes: refresh tokens rotate on each refresh; the app stores the new one each time. New apps are limited to a small
number of members (you and a few testers), which is all a personal app needs. Read the WHOOP API Terms of Use: they
forbid sharing your credentials or publishing them in open-source code.

The official Whoop API has no step count: steps come from Health Connect or the phone (see *Steps* below).

## Withings

1. Create a developer account at <https://developer.withings.com>, then an application ("Public API integration").
2. Callback URL: the HTTPS address of your relay page (see above). Withings checks that it answers.
3. Scopes requested by the app: `user.info`, `user.metrics`, `user.activity`.
4. Copy the Client ID and Consumer Secret into the app, with the same callback URL.

Notes: the authorization code is valid for 30 seconds, so finish the login without waiting. Access tokens last 3 hours
and are refreshed on the phone (refresh tokens rotate). Disconnecting in the app forgets the tokens on the phone;
revoke the app's access from your Withings account settings if you want the authorization removed on their side.

## Polar

1. Sign in at <https://admin.polaraccesslink.com> with your Polar Flow account and create a client.
2. Redirect URL: `pepfitopen://polar` (or your relay page).
3. Copy the Client ID and Client Secret into the app.

Notes: Polar AccessLink tokens do not expire and have no refresh token. On the first sync the app registers your
Polar user with your client (`POST /v3/users`), as AccessLink requires. The scope is `accesslink.read_all`.

## Steps

No credentials needed. The same rule is used everywhere (Home card, Steps page, day energy): Withings when connected
(unless Health Connect has a higher count for the day), else Health Connect (`Steps`, read permission), else the
phone's own step sensor (Android `TYPE_STEP_COUNTER`, `ACTIVITY_RECOGNITION` permission, read by the local module
`app/modules/pepfit-sante`, no Google service). The source is always named under the number.

## Troubleshooting

- *"Connection refused. Check your API credentials…"*: the provider refused the client ID, the secret or the redirect URL. Compare the
  redirect URL character by character with the dashboard.
- Too many requests (HTTP 429): each provider has a per-app quota; wait and retry.
- The browser stays on the relay page: tap "Open pepfit"; check that the app is installed and that the URL ends with
  the provider name (`withings.html`) or has `?provider=withings`.
