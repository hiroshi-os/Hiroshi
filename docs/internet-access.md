# Managed internet access

[Milestone 5](https://github.com/hiroshi-os/Hiroshi/milestone/5) delivers automatic
internet connectivity in three ordered items:

1. [Daemon lifecycle and runtime](https://github.com/hiroshi-os/Hiroshi/issues/88).
2. [Desktop and CLI controls](https://github.com/hiroshi-os/Hiroshi/issues/89).
3. [Internet acceptance and operational documentation](https://github.com/hiroshi-os/Hiroshi/issues/90).

The first item adds the daemon API and OpenTunnel SDK integration. Desktop
enable/disable controls and a convenience remote pairing CLI remain the next
item; generating a normal LAN invitation still does not enable internet access.
The mobile application's source is unchanged.

## Daemon contract

Internet access defaults off. An owner can use the authenticated private API:

```http
GET /v1/internet
```

The response contains `revision`, `enabled`, `state`, `url` and `error`.
States are `disabled`, `starting`, `connected`, `reconnecting` and `failed`.
The URL is present only while connected. To enable, disable, or explicitly retry:

```http
POST /v1/internet
Content-Type: application/json

{"revision":0,"enabled":true}
```

Use the latest revision from GET; stale updates return 409. Enabling returns
while certificate/connection setup continues, so poll status with a bounded
deadline. Sending `enabled:true` again explicitly retries a failed connection.
Disabling cancels setup, closes the gateway and waits for SDK cleanup. Overlapping
changes are rejected. Setup has a five-minute deadline; cleanup waits at most
ten seconds before reporting that it is still pending. No replacement connection
starts until prior cleanup finishes. Fatal setup/attach errors require explicit
retry; the SDK reconnects an established tunnel with backoff after network loss.
No GUI or child process is launched to reconnect.

Once connected, create an internet invitation through the private pairing API:

```http
POST /v1/network/pairing/create
Content-Type: application/json

{"remote":true}
```

It returns the existing [pairing contract](device-pairing.md) with the managed
HTTPS address. A disconnected tunnel cannot issue a new internet invitation.
`remote:true` cannot be combined with `address`. The ordinary `address` field
continues to support operator-configured HTTPS endpoints independently.

## Identity and boundaries

OpenTunnel provides a hosted relay and a public HTTPS hostname. TLS terminates
inside the daemon's SDK. The relay forwards encrypted visitor traffic; it can
observe routing information and timing. Certificate issuance and relay
availability are external dependencies. The daemon remains reachable only while
the PC, daemon, network and relay are available. A client does not need to share
the PC's LAN, VPN or internet provider.

The tunnel targets a dedicated loopback gateway that enforces network credentials,
browser origins, public request limits and owner-route restrictions. It never
targets the private owner listener. Loopback peer addresses do not confer owner
privileges. The LAN listener can stay disabled. Device revocation and master
network-token rotation also apply to tunneled traffic, including active streams.
Internet disable closes only that gateway; it does not stop engine-owned runs or
disable LAN access. Paired credentials remain independently revocable and can
be used again when an authorized endpoint becomes reachable.

`internet.json` stores opt-in intent, revision and a stable random route.
SDK identity, relay token, certificate and private key live under
`<Hiroshi home>/remote/opentunnel/default/`. They are isolated from other apps'
tunnel profiles. Keep the data directory private and out of Git. Identity is
retained on disable so re-enabling reuses the hostname; disabling does not delete
the hosted registration. Restart restores previously enabled intent. Invalid
saved configuration is preserved, remote startup fails closed, and private
local access remains available. Never log relay tokens, private keys or device
credentials. The public hostname is not a substitute for authentication.

The SDK honors HTTP proxy settings for control requests and its bridge. Preserve
`HTTPS_PROXY`, `HTTP_PROXY`, `ALL_PROXY`, `NO_PROXY` and certificate trust settings;
do not disable TLS verification to work around a network error. A college or
corporate network must permit the outbound HTTPS/WebSocket connection to the
relay. No inbound router forwarding is needed. Source development uses Bun
1.4.2, pinned in `.bun-version`; compiled sidecars include that runtime.

## Verification

Ordinary CI uses controlled tunnel fixtures and real loopback gateways, with no
hosted registration. It checks lifecycle cancellation, stale callbacks, route
persistence, restart, reconnect state, atomic intent updates, private owner
boundaries, LAN independence, credential rotation and malformed configuration.
Native/source/packaged regressions verify the supported runtime across platforms.

The explicit hosted probe creates one isolated daemon and a temporary public
tunnel, pairs a device over HTTPS, runs a real session, denies owner routes and
verifies revocation. It disables the tunnel and deletes a completed hosted test
registration afterward. Pending certificate state is preserved for resumption.
It never edits an existing user tunnel profile or starts a desktop:

```sh
bun scripts/smoke-internet.ts --live
# Exercise the compiled sidecar:
bun scripts/smoke-internet.ts --live --engine <path-to-hiroshi-engine>
# Resume an interrupted isolated probe using its printed data directory:
bun scripts/smoke-internet.ts --live --home <probe-directory>
```

Run the probe under the repository RAM/process/time guard. The initial hosted
probe passed over the configured college-network proxy, using a 1536 MB process
tree ceiling and a measured 679 MB peak. This proves a hosted HTTPS round trip
from this computer; an independent mobile-network device check and the remaining
acceptance scenarios are tracked in issue 90.
