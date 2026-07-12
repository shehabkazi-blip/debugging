# Teacher Cheat Sheet

| Scenario | Primary symptom | Root cause | Most useful first commands |
|---|---|---|---|
| 01 | API exits | Invalid Compose command override | `ps -a`, `logs api`, `inspect Cmd` |
| 02 | API exits code 1 | Empty `DB_PASSWORD` | `logs api`, `compose config`, inspect env |
| 03 | API unhealthy | `DB_HOST=localhost` | logs, env, `getent hosts db`, `/health` |
| 04 | Host access fails | Wrong container target port | `ps`, `docker port`, inside-container request |
| 05 | NGINX cannot reach API | App bound to `127.0.0.1` | compare same-container vs cross-container curl/wget |
| 06 | API runs but unhealthy | Health path `/healthz` is wrong | inspect `.State.Health.Log` |
| 07 | Files missing | Empty bind mount overlays `/app` | logs, inspect mounts, compare image filesystem |
| 08 | Write fails | Read-only mount | logs, inspect mounts and container user |
| 09 | Exit 137 | Memory limit exceeded | stats, exit code, `OOMKilled` |
| 10 | Restarting repeatedly | Crash plus `restart: always` | ps, follow logs, restart count |
| 11 | NGINX failure | Invalid upstream DNS name | nginx logs, config, service DNS |
| 12 | Temporary HTTP 503 | Startup is not readiness | simultaneous db/api logs, repeated health requests |

## Five questions students must answer

1. What exactly is failing: process, health check, connectivity, or user request?
2. What evidence proves it?
3. Where is the failure boundary: host, proxy, app, network, storage, or database?
4. What is the smallest controlled change that tests the hypothesis?
5. How will you prove recovery and prevent recurrence?
