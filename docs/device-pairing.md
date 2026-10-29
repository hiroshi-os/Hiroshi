# Device pairing

Tracked in [Device pairing and remote daemon access](https://github.com/hiroshi-os/Hiroshi/milestone/4),
with [credentials](https://github.com/hiroshi-os/Hiroshi/issues/84),
[desktop and CLI](https://github.com/hiroshi-os/Hiroshi/issues/85), and
[the client contract](https://github.com/hiroshi-os/Hiroshi/issues/86).

## Connect a device

Open **Settings → Daemon**, enable **Expose managed daemon**, then choose
**Pair device**. Scan the QR code with a Hiroshi-compatible client, or copy a
link. Each invitation lasts five minutes and can be used once. **New code**
cancels the previous invitation; **Cancel invitation** withdraws it immediately.
An ordinary link preview never consumes an invitation.

The engine CLI can produce the same invitation without opening a desktop:

```sh
bun engine/src/index.ts pair --expose --port 34123
# Installed sidecar:
hiroshi-engine pair --json
# An existing HTTPS reverse proxy:
hiroshi-engine pair --url https://your-daemon.example
```

`pair` requires an already running daemon. `--expose` explicitly enables the
network listener. Without that flag, pairing cannot silently expose the engine.
`--json` prints the invitation, links and SVG QR; ordinary output includes a
terminal QR. Neither includes a permanent owner or device credential.

Use a reachable LAN/VPN address, or an HTTPS endpoint whose proxy you configured.
Hiroshi advertises IPv4 network interfaces and a hostname fallback, excluding
loopback. A hostname or one of several interface addresses may not resolve from
the other device; clients should try the advertised addresses before asking for
a manual address. HTTPS overrides must be exact origins, without credentials,
paths, queries or fragments. The listener binds IPv4 network interfaces.
Ordinary pairing does not create a tunnel, open firewall ports, or install a
mobile client. The separate [managed internet API](internet-access.md) can create
an opt-in tunnel; its desktop and CLI controls are tracked in milestone 5.
Pairing alone does not make a daemon reachable across the internet.

Paired devices have access to sessions, files, commands, agents and approvals.
Only pair devices you trust. Use a private network, VPN or trusted HTTPS proxy;
plain HTTP does not encrypt invitations, credentials or session traffic.
Browser clients also require their exact origin in **Allowed browser origins**.
Native HTTP clients do not need a browser origin.

The device list provides independent **Revoke** actions. Revocation immediately
closes that device's active remote streams and rejects later requests. Credentials
expire after 90 days and survive daemon restarts. Restarting loses pending
invitations. Changing listener settings cancels pending invitations and closes
remote connections; existing credentials work again after exposure is enabled.
Regenerating the network token invalidates every paired credential, including
after restart. Closing a remote connection does not cancel engine-owned runs.

## Version 1 connection contract

The QR contains JSON, independently identified from any other backend:

```json
{
  "type": "hiroshi.pairing",
  "version": 1,
  "serverID": "<stable UUID>",
  "protocol": 17,
  "code": "<43-character base64url invitation>",
  "urls": ["http://192.168.1.20:34123"],
  "expiresAt": 1790000300000
}
```

The UUID is stable in `network.json` across restarts, listener changes and token
rotation. It identifies the saved daemon, not a cryptographic identity proof.
The temporary code has 256 bits of randomness. A link is
`<origin>/pair/<code>`. GET serves a confirmation form; POSTing its `name` form
field redeems it and returns the same JSON as the API below. The form is a
credential exchange page, not a remote session UI.

```http
POST /v1/pairing/redeem
Content-Type: application/json

{"code":"<invitation>","name":"My phone"}
```

Successful response, HTTP 200:

```json
{
  "type": "hiroshi.connection",
  "version": 1,
  "server": {
    "id": "<stable UUID>",
    "name": "Hiroshi",
    "version": "0.24.0",
    "protocol": 17,
    "transport": "http-sse",
    "capabilities": ["sessions", "prompts", "events", "permissions", "device-revocation"]
  },
  "token": "hd_<device secret>",
  "device": {"id":"<UUID>","name":"My phone","createdAt":1790000000000,"expiresAt":1797776000000}
}
```

The secret is returned once. Save it in device secure storage, send it only to
the approved daemon origin using `Authorization: Bearer <token>`, and never put
it in URLs, analytics or logs. Do not forward authorization through a redirect
to a different origin. A QR parser must validate type/version, expiry, address
schemes and response server identity before saving a connection. Never execute
QR contents. For a link, present the origin for confirmation and learn the server
identity from the successful response.

Redemption is atomic: concurrent attempts have one winner. Errors use
`{"error":{"code":"...","message":"..."}}`: invalid/expired/used grants return
400, forbidden origins 403, device-capacity conflicts 409 and rate/concurrency
limits 429. Requests have a 4 KiB body limit and five-second read timeout.
There are at most 32 active devices, 16 recent invitation statuses, eight
concurrent exchanges and 60 exchange attempts per minute globally. A failed
persistent write does not consume the grant or issue a usable credential.

Normal remote operations use the existing typed
[protocol](../engine/src/protocol.ts), not a second session implementation:

| Action | HTTP endpoint |
| --- | --- |
| Health | `GET /v1/health` |
| List/create sessions | `GET /v1/sessions`, `POST /v1/sessions` |
| Session snapshot | `GET /v1/sessions/:id` |
| Send/queue/steer | `POST /v1/sessions/:id/messages` |
| Interrupt session | `POST /v1/sessions/:id/interrupt` |
| Approve/deny | `POST /v1/permissions/:id/answer` |
| Event stream | `GET /v1/events?after=<last committed seq>` |

Prompts accept `text`, optional catalog `model`, delivery `mode` and an
idempotency `key`; retries must reuse the same key. Permission answers use
`decision: "allow" | "deny"`, optionally `remember`. Treat engine policy as the
authority. A disconnected phone must not implicitly approve pending actions.
The SSE feed carries durable `EngineEvent` records plus `hello` and `overflow`
control frames. Persist the last applied sequence, deduplicate by sequence,
reconnect with bounded backoff and resume with `after`. If the hello watermark
is behind the saved cursor, or recovery cannot fill a gap, fetch snapshots
again. Remote requests have a ten-minute maximum lease (or earlier device
expiry), so normal stream reconnection is required. At most 64 authenticated
remote requests are active simultaneously.

Owner management endpoints stay on the private listener: network settings and
token operations, `/v1/network/pairing`, `/v1/network/pairing/create`,
`/v1/network/pairing/cancel`, `/v1/network/devices/revoke`, and shutdown.
Revocation uses the current device-list revision to reject stale updates.
These route restrictions do not sandbox a trusted device's ordinary command
and file access.

Device secrets are stored only as SHA-256 hashes in `paired-devices.json`, bound
to the current network-token authority. Invitations remain in memory as hashes.
Malformed saved device data is preserved and pairing fails closed while private
local access remains available. Back up the daemon data directory deliberately;
restoring old credential files can restore access that was revoked later.

## Follow-up mobile adapter plan

The server and desktop flow were implemented first. No mobile source changes are
part of this milestone. The existing mobile client needs an explicit additional
backend; scanning this QR is not supported by its current adapter.

1. Add a `hiroshi` backend discriminator to saved connections and QR parsing.
   Keep existing connection formats intact. Confirm an origin, perform the POST
   exchange, verify type/version/server ID and store the credential securely.
   Persist URLs, server ID, device ID, expiry and protocol separately from the
   secret. Reject unsupported versions with a clear upgrade message.
2. Implement a Hiroshi HTTP/SSE adapter against the typed protocol. Map session
   lists, transcript parts, queue/steer/interrupt and pending approvals into the
   mobile domain without translating them through the existing backend's API.
   Keep per-server event cursors and session identifiers isolated.
3. Add reconnect, background/resume and offline recovery. Try approved addresses
   with short timeouts; never race multiple redemption POSTs after one succeeds.
   An ambiguous exchange timeout may have consumed the code: request a fresh
   invitation rather than replaying indefinitely. Handle 401 by requiring
   pairing again; treat 429 with bounded backoff. Do not silently downgrade an
   HTTPS saved connection to HTTP.
4. Test two devices against a real isolated daemon: pairing and cancellation,
   expired/replayed QR, identity mismatch, competing prompt retries, transcript
   replay after sleep, approvals, independent revocation, token rotation and
   daemon restart. Prove existing backend connections still work. Test LAN/VPN
   and configured HTTPS on actual devices before claiming mobile support.

Automatic internet tunneling is a separate follow-up decision, with its own
tracked scope for lifecycle, authentication, address changes and shutdown.
