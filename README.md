# Docker & Docker Compose Debugging Lab

A classroom-ready incident lab containing deliberately broken Docker Compose scenarios. Students receive a symptom, investigate using evidence, identify the root cause, apply a fix, and verify recovery.

## Architecture

```text
Browser/curl -> NGINX :8080 -> Node.js API :3000 -> PostgreSQL :5432
```

## Requirements

- Docker Engine or Docker Desktop
- Docker Compose v2 (`docker compose`)
- `curl`

## First verify the healthy application

```bash
docker compose -f compose.base.yml up -d --build
docker compose -f compose.base.yml ps
curl http://localhost:8080/
curl http://localhost:8080/health
curl http://localhost:8080/users
```

Expected result: all services run, API health returns HTTP 200, and NGINX can reach the API.

Reset before another exercise:

```bash
./scripts/reset.sh
```

## Run a broken scenario

```bash
./scripts/run-scenario.sh 01-invalid-command
```

Or manually:

```bash
docker compose \
  -f compose.base.yml \
  -f scenarios/01-invalid-command.yml \
  up -d --build
```

Use the same two `-f` arguments for every debugging command in that scenario:

```bash
docker compose \
  -f compose.base.yml \
  -f scenarios/01-invalid-command.yml \
  ps
```

A useful shell shortcut is:

```bash
export DC='docker compose -f compose.base.yml -f scenarios/01-invalid-command.yml'
$DC ps
$DC logs api
```

---

# Professional investigation sequence

Students should use this order before changing source code:

```bash
docker compose ps
docker compose logs --tail 100 <service>
docker compose config
docker inspect <container>
docker compose exec <service> sh
docker stats --no-stream
docker network inspect <network>
```

For a stopped container, `docker compose exec` will not work. Use logs and inspect first.

## Evidence worksheet

```text
Incident number:
Observed symptom:
Expected behavior:
Affected service:
Container state:
Exit code:
Health status:
First useful error:
Network/DNS test:
Port/listener test:
Environment/config test:
Root cause:
Fix:
Verification:
Prevention:
```

---

# Scenario 01 — Invalid startup command

## Start

```bash
./scripts/run-scenario.sh 01-invalid-command
```

## Student symptom

The API container exits immediately. NGINX may return an error or fail because its upstream is unavailable.

## Investigate

```bash
export DC='docker compose -f compose.base.yml -f scenarios/01-invalid-command.yml'
$DC ps -a
$DC logs api
$DC config

docker inspect docker-debugging-lab-api-1 \
  --format 'status={{.State.Status}} exit={{.State.ExitCode}} error={{.State.Error}}'

docker inspect docker-debugging-lab-api-1 \
  --format 'entrypoint={{json .Config.Entrypoint}} cmd={{json .Config.Cmd}}'
```

Container names may differ. Find the exact name with:

```bash
$DC ps -a
```

## Expected discovery

```text
npm error Missing script: "start-does-not-exist"
```

## Root cause

The Compose `command` overrides the valid Dockerfile command.

## Fix

Remove the `command` override or replace it with:

```yaml
command: ["npm", "start"]
```

## Verify

```bash
$DC up -d --build --force-recreate
$DC ps
curl http://localhost:3000/health
```

## Prevention

Validate the resolved Compose configuration in CI:

```bash
docker compose config -q
```

---

# Scenario 02 — Missing required environment variable

## Start

```bash
./scripts/run-scenario.sh 02-missing-env
```

## Student symptom

The API exits with code 1.

## Investigate

```bash
export DC='docker compose -f compose.base.yml -f scenarios/02-missing-env.yml'
$DC ps -a
$DC logs api
$DC config

docker inspect docker-debugging-lab-api-1 \
  --format '{{range .Config.Env}}{{println .}}{{end}}' | sort
```

## Expected discovery

```text
[FATAL] Missing required environment variable: DB_PASSWORD
```

## Root cause

`DB_PASSWORD` is present but empty in the final Compose configuration.

## Fix

Set the value back to:

```yaml
DB_PASSWORD: labpass
```

## Verification

```bash
$DC up -d --force-recreate
$DC logs -f api
curl http://localhost:3000/health
```

## Prevention

- Validate required configuration at startup.
- Use Compose interpolation checks such as `${DB_PASSWORD:?DB_PASSWORD is required}`.
- Never print real secret values in classroom screenshots or production logs.

---

# Scenario 03 — `localhost` used for another container

## Start

```bash
./scripts/run-scenario.sh 03-wrong-db-host
```

## Student symptom

The API process runs, but health checks and `/users` fail with database connection errors.

## Investigate

```bash
export DC='docker compose -f compose.base.yml -f scenarios/03-wrong-db-host.yml'
$DC ps
$DC logs --tail 100 api
curl -i http://localhost:3000/health
$DC exec api env | grep '^DB_'
$DC exec api getent hosts db
$DC exec api wget -qO- http://127.0.0.1:3000/ || true
$DC exec api sh -c 'cat /etc/hosts; echo; cat /etc/resolv.conf'
```

Inspect network membership:

```bash
docker network ls
docker network inspect docker-debugging-lab_default
```

## Expected discovery

The application attempts to connect to `127.0.0.1:5432`. Inside the API container, localhost is the API container—not PostgreSQL.

## Root cause

```text
DB_HOST=localhost
```

## Fix

```text
DB_HOST=db
```

`db` is the Compose service name and Docker DNS hostname.

## Verify

```bash
$DC up -d --force-recreate
curl -i http://localhost:3000/health
curl -i http://localhost:3000/users
```

---

# Scenario 04 — Wrong published container port

## Start

```bash
./scripts/run-scenario.sh 04-wrong-port
```

## Student symptom

The API says it is listening on port 3000, but requests through an incorrectly published port fail.

## Investigate

```bash
export DC='docker compose -f compose.base.yml -f scenarios/04-wrong-port.yml'
$DC ps
$DC logs api
docker port docker-debugging-lab-api-1
$DC exec api sh -c 'wget -qO- http://127.0.0.1:3000/ && echo'
curl -v http://localhost:3000/
```

Inspect the final port configuration:

```bash
$DC config
```

## Expected discovery

The process listens on container port `3000`, while a host mapping targets container port `5000`.

## Root cause

Host and container ports were confused.

## Correct mapping

```yaml
ports:
  - "3000:3000"
```

The left side is the host port; the right side is the container port.

---

# Scenario 05 — Application bound to container loopback only

## Start

```bash
./scripts/run-scenario.sh 05-bind-localhost
```

## Student symptom

The endpoint works from inside the API container but not from NGINX or the host-published port.

## Investigate from three locations

### Inside the API container

```bash
export DC='docker compose -f compose.base.yml -f scenarios/05-bind-localhost.yml'
$DC exec api wget -qO- http://127.0.0.1:3000/
```

### From the NGINX container

```bash
$DC exec nginx wget -qO- http://api:3000/ || true
```

### From the host

```bash
curl -v http://localhost:3000/
curl -v http://localhost:8080/
```

Review startup logs:

```bash
$DC logs api
```

## Expected discovery

```text
API listening on http://127.0.0.1:3000
```

## Root cause

The application accepts only loopback traffic inside its own network namespace.

## Fix

```text
BIND_ADDRESS=0.0.0.0
```

---

# Scenario 06 — Incorrect health-check endpoint

## Start

```bash
./scripts/run-scenario.sh 06-bad-healthcheck
```

## Student symptom

The API serves requests but Docker marks it `unhealthy`.

## Investigate

```bash
export DC='docker compose -f compose.base.yml -f scenarios/06-bad-healthcheck.yml'
$DC ps
curl -i http://localhost:3000/
curl -i http://localhost:3000/health

docker inspect docker-debugging-lab-api-1 \
  --format '{{json .State.Health}}'

docker inspect docker-debugging-lab-api-1 \
  --format '{{range .State.Health.Log}}{{println .Start "exit=" .ExitCode .Output}}{{end}}'
```

## Expected discovery

The health check calls `/healthz`, but the application exposes `/health`.

## Lesson

A running process is not automatically a healthy application. Also, a bad health-check definition can mark a functioning application unhealthy.

## Fix

```yaml
healthcheck:
  test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/health"]
```

---

# Scenario 07 — Bind mount hides image contents

## Start

```bash
./scripts/run-scenario.sh 07-volume-hides-app
```

## Student symptom

The API exits because files such as `package.json` disappear.

## Investigate

```bash
export DC='docker compose -f compose.base.yml -f scenarios/07-volume-hides-app.yml'
$DC ps -a
$DC logs api
$DC config

docker inspect docker-debugging-lab-api-1 \
  --format '{{json .Mounts}}'
```

Because the normal container exits, inspect the image without the problematic mount:

```bash
docker run --rm docker-debugging-lab-api ls -la /app
```

Then inspect what the host directory contains:

```bash
ls -la empty-app
```

## Expected discovery

The image contains `/app/package.json` and `/app/server.js`, but the bind mount overlays `/app` with an empty host directory.

## Root cause

```yaml
volumes:
  - ./empty-app:/app
```

## Fix

Remove the mount or mount only the intended data directory.

## Lesson

A bind mount does not merge with image files; it hides the existing path while mounted.

---

# Scenario 08 — Read-only volume permission failure

## Start

```bash
./scripts/run-scenario.sh 08-permission-denied
```

## Student symptom

The API exits before startup with a write error.

## Investigate

```bash
export DC='docker compose -f compose.base.yml -f scenarios/08-permission-denied.yml'
$DC ps -a
$DC logs api
$DC config

docker inspect docker-debugging-lab-api-1 \
  --format '{{json .Mounts}}'

docker inspect docker-debugging-lab-api-1 \
  --format 'user={{json .Config.User}} command={{json .Config.Cmd}}'
```

## Expected discovery

```text
cannot create /data/output.txt: Read-only file system
```

## Root cause

The startup command writes to a volume mounted with `:ro`.

## Fix options

- Do not write to the location.
- Mount a dedicated writable volume.
- Remove `:ro` only when writes are genuinely required.

Do not solve all permission problems by running the application as root.

---

# Scenario 09 — Memory limit and OOM investigation

## Start

```bash
./scripts/run-scenario.sh 09-oom
```

Wait until the API becomes healthy, then trigger memory allocation:

```bash
curl -v http://localhost:3000/memory
```

## Student symptom

The request disconnects or fails, and the API container may exit with code 137.

## Investigate

```bash
export DC='docker compose -f compose.base.yml -f scenarios/09-oom.yml'
$DC ps -a
$DC logs --tail 100 api
docker stats --no-stream

docker inspect docker-debugging-lab-api-1 \
  --format 'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} finished={{.State.FinishedAt}}'
```

## Expected discovery

- Memory limit: approximately 128 MB.
- Endpoint attempts to allocate approximately 300 MB.
- `OOMKilled=true` is strong evidence of an OOM termination.

## Important lesson

Exit code 137 is a clue, not sufficient proof by itself. Confirm with `.State.OOMKilled`, resource metrics, application behavior, and host/container events.

## Fix

For the lab, lower `ALLOCATE_MB` or raise the memory limit. In production, first determine whether usage is legitimate, a leak, an unsafe request, or an incorrectly sized limit.

---

# Scenario 10 — Restart loop

## Start

```bash
./scripts/run-scenario.sh 10-restart-loop
```

## Student symptom

The API repeatedly changes to `Restarting`.

## Investigate

```bash
export DC='docker compose -f compose.base.yml -f scenarios/10-restart-loop.yml'
$DC ps
$DC logs --tail 30 -f api

docker inspect docker-debugging-lab-api-1 \
  --format 'status={{.State.Status}} exit={{.State.ExitCode}} restartCount={{.RestartCount}}'
```

Temporarily stop automatic restart while investigating:

```bash
docker update --restart=no docker-debugging-lab-api-1
docker stop docker-debugging-lab-api-1
docker start -a docker-debugging-lab-api-1
```

## Expected discovery

The command intentionally exits with status 1, and `restart: always` repeatedly starts it.

## Lesson

A restart policy can improve resilience, but it does not repair the root cause and may create noise or hide the original startup failure.

---

# Scenario 11 — Broken NGINX upstream / gateway failure

## Start

```bash
./scripts/run-scenario.sh 11-broken-nginx-upstream
```

## Student symptom

NGINX cannot start or cannot resolve its configured upstream. Requests to port 8080 fail.

## Investigate

```bash
export DC='docker compose -f compose.base.yml -f scenarios/11-broken-nginx-upstream.yml'
$DC ps -a
$DC logs nginx
$DC config
```

Compare DNS names available on the Compose network:

```bash
$DC exec api getent hosts db
```

After correcting NGINX enough for it to run, test service DNS from NGINX:

```bash
$DC exec nginx getent hosts api
$DC exec nginx wget -qO- http://api:3000/
```

## Expected discovery

The proxy points to a nonexistent Compose service:

```text
backend-does-not-exist
```

## Fix

```nginx
proxy_pass http://api:3000;
```

## Lesson

A `502 Bad Gateway` generally means the proxy is reachable but its upstream request failed. Investigate upstream DNS, port, process binding, health, network membership, and protocol.

---

# Scenario 12 — Dependency readiness race

## Start

For the clearest demonstration, remove old database data first:

```bash
./scripts/reset.sh
./scripts/run-scenario.sh 12-db-not-ready
```

## Student symptom

The API may start before PostgreSQL is ready. Early health requests can return HTTP 503 and later recover without a code change.

## Investigate

```bash
export DC='docker compose -f compose.base.yml -f scenarios/12-db-not-ready.yml'
$DC ps
$DC logs -f db api
```

In another terminal:

```bash
for i in $(seq 1 15); do
  date
  curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:3000/health || true
  sleep 1
done
```

## Expected discovery

Container startup order and service readiness are different concepts. A process can exist before it can accept useful requests.

## Production-grade prevention

- Give dependencies meaningful health checks.
- Use readiness conditions where supported.
- Implement bounded application retries with backoff.
- Make startup and health signals observable.
- Avoid assuming that `depends_on` alone guarantees readiness.

---

# Instructor challenge mode

Do not tell students which scenario is active. Start one privately and provide only the customer symptom.

Example incident ticket:

```text
INC-1042
Customer reports that http://localhost:8080 returns an error.
The release completed five minutes ago.
Do not rebuild or edit files until you collect container status, logs,
resolved configuration, health state, and one network test.
```

## Suggested team roles

- Incident Commander: controls the timeline and hypotheses.
- Platform Engineer: investigates Docker, networking, storage, and resources.
- Application Engineer: interprets application logs and runtime configuration.
- Scribe: records evidence, changes, verification, and prevention.

## Scoring rubric (20 points)

| Area | Points |
|---|---:|
| Captured status, exit code, and health | 3 |
| Found the first useful error | 3 |
| Used resolved Compose configuration | 2 |
| Performed a relevant network/port/config test | 3 |
| Explained the real root cause | 4 |
| Applied one controlled fix | 2 |
| Verified recovery end-to-end | 2 |
| Proposed prevention | 1 |

## Golden rule

```text
Observe -> collect evidence -> form a hypothesis -> test one variable -> fix -> verify -> prevent
```
