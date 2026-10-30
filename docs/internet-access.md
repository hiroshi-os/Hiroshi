# Managed internet access

[Milestone 5](https://github.com/hiroshi-os/Hiroshi/milestone/5) delivers automatic
internet connectivity in three ordered items:

1. [Daemon lifecycle and runtime](https://github.com/hiroshi-os/Hiroshi/issues/88).
2. [Desktop and CLI controls](https://github.com/hiroshi-os/Hiroshi/issues/89).
3. [Internet acceptance and operational documentation](https://github.com/hiroshi-os/Hiroshi/issues/90).

The daemon lifecycle, desktop/CLI controls and server acceptance checks are
implemented. Generating a normal LAN invitation does not enable internet access.
The mobile application's source is unchanged; its adapter remains a separate follow-up.

## Use internet pairing

Open **Settings → Daemon → Internet access** and enable the toggle. Initial
certificate setup can take a minute. The card shows setup, connected,
reconnecting or failure state, with an HTTPS address and Copy action when ready.
Use **Retry** after a failure, **Refresh** to check status, or disable the toggle
to cancel setup or close internet access. LAN exposure can remain off.

Under **Pair a device**, select **Internet** and choose **Pair device**. Internet
is selected automatically when internet access is enabled. The QR and copyable
link use the public HTTPS endpoint; the create action stays disabled while that
endpoint is unavailable. A disconnected status hides the previous QR/link.
**LAN / HTTPS** selects direct network or operator-configured HTTPS pairing.
Each new invitation cancels the previous one, and device access can be revoked
independently in the same card. A compatible client is still required.

From the running daemon's engine CLI:

```sh
hiroshi-engine pair --remote
hiroshi-engine pair --remote --json --timeout 120
hiroshi-engine internet status --json
hiroshi-engine internet enable
hiroshi-engine internet retry
hiroshi-engine internet disable
# For source development, replace hiroshi-engine with:
# bun engine/src/index.ts
```

`pair --remote` explicitly enables internet access if off, waits for a connected
HTTPS route, then prints a single-use QR/link. Progress goes to stderr so JSON
stdout remains machine readable. It never enables LAN exposure. `--remote`
cannot be combined with `--url`, `--expose` or `--port`. Wait time defaults to
300 seconds and can be set from 1 to 300 seconds. Timeout or CLI exit leaves
daemon-owned setup/access enabled; use `internet disable` to stop it. A fatal
connection error requires explicit retry, and no invitation is issued from an
unavailable route. Status and enable commands return promptly during setup.

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
Native controls also cover explicit enable, progress, failure/retry, disabling
setup, internet pairing with LAN off and hiding stale QR codes. Ordinary source
and packaged window CI checks verify default-off internet access without
creating public registrations.

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

Run live probes under the repository RAM/process/time guard. They require a
fresh marked probe directory, or an explicitly resumed directory from a prior
probe with no daemon still running. Unmarked user directories and existing
daemons are rejected before setup. Pending certificate state is preserved for
resumption; ordinary user tunnel profiles are never used.

The extended hosted acceptance exercises two independent credentials and streams,
cursor replay after disconnection, independent revocation, a real process crash
and restart on the same public hostname, persisted credentials/transcript,
network-token rotation and closing the public endpoint. Exactly one daemon is
active at a time, and complete hosted registrations are deleted in cleanup:

```sh
bun scripts/hosted-acceptance.ts --live
bun scripts/hosted-acceptance.ts --live --engine <path-to-hiroshi-engine>
# Also dispatch a read-only reachability check from another network:
bun scripts/hosted-acceptance.ts --live --external-ref <trusted-repository-branch>
```

`--external-ref` uses the authenticated GitHub CLI to manually dispatch the CI
workflow at a trusted branch. Its isolated Ubuntu job receives only the public
OpenTunnel origin and a correlation ID. It verifies HTTPS reachability, required
authentication and owner-route denial, with no device credential or pairing code.
Normal CI jobs still run for that dispatch, and a separate concurrency group
keeps it from canceling standard checks. The local probe waits for the independent
reachability job specifically; its result is not a replacement for the full CI
result. GitHub commands and polling have explicit deadlines. No repository secret
is created.

| Verification layer | What it proves | Limit |
| --- | --- | --- |
| Controlled CI gateway and durable feed | Ordered replay after a simulated connection loss, independent stream revocation, disable, lifecycle and failure handling | Does not contact the hosted relay |
| Hosted source/compiled daemon acceptance | TLS pairing, authenticated sessions/events, credential isolation, crash recovery, stable route, rotation and disable through the actual relay | The two authenticated clients are logical devices on the test PC |
| Independent GitHub-hosted check | The public HTTPS gateway is reachable from outside the PC's college network and rejects unauthorized access | Intentionally receives no authenticated control credential |
| Native and hosted desktop probes | Controls, source/packaged QR rendering/decoding, remote CLI and revocation | Does not implement a mobile client |

The [independent-network acceptance run](https://github.com/hiroshi-os/Hiroshi/actions/runs/41001566575)
passed against the temporary endpoint. The source hosted recovery probe also
passed through the configured proxy, with a 658 MB measured peak under a 1536 MB
process-tree ceiling. These checks establish server behavior; physical mobile
client compatibility must be tested when its adapter is built.

The opt-in desktop probe additionally drives real controls and independently
decodes the QR from a screenshot, pairs over public HTTPS, runs a session,
revokes the device, invokes the remote CLI and disables access with LAN off:

```sh
bun internet.integration.ts --live
# Set HIROSHI_TEST_PACKAGED to the compiled desktop path to check that build.
```

Each run owns one window and daemon, under explicit resource/time ceilings, and
deletes its temporary hosted registration afterward. It is not run against the
public service in ordinary CI.
