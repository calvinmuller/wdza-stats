# 02: Worker: live Snapshot ingestion

**What to build:** The Worker continuously polls the RCON API for the configured Server and keeps a durable record of the most recent Snapshot, so downstream features (live page, Match detection) always have current data to read without ever calling RCON themselves.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A typed RCON client wraps `GET /v1/status` and `GET /v1/players` for one Server (base URL + bearer token in, parsed Snapshot out); it is the only code in the system that calls the RCON API
- [ ] The Worker polls both endpoints for the configured Server every 15 seconds and merges the two responses into one timestamped Snapshot
- [ ] The latest Snapshot per Server is persisted to Postgres, overwriting/updating in place (this is current-state data, not history yet)
- [ ] If a poll fails (network error, non-2xx response), the Worker logs the failure and retries on the next 15s tick rather than crashing
- [ ] Test seam: the RCON client is replaceable with a fake that returns a scripted sequence of raw responses; a test using the fake asserts that the persisted latest-Snapshot row matches the most recent scripted response, without hitting the network
- [ ] No RCON write endpoints are called anywhere in this ticket's code
