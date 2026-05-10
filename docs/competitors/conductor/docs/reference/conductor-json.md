---
title: conductor.json
description: Repository-level Conductor scripts and settings
url: /docs/reference/conductor-json
site: www.conductor.build
---

# conductor.json



`conductor.json` is an optional file at the root of a repository. Commit it when the repository should share Conductor scripts and settings across teammates.

For the workflow to create and publish the file, see [Share scripts with teammates](/docs/reference/scripts/share-with-teammates).

## Example [#example]

```json
{
    "scripts": {
        "setup": "npm install",
        "run": "npm run dev"
    },
    "runScriptMode": "concurrent"
}
```

## Fields [#fields]

| Field | Type | Description |
| --- | --- | --- |
| `scripts.setup` | string | Command to run when Conductor creates a workspace |
| `scripts.run` | string | Command to run when you click the Run button |
| `scripts.archive` | string | Command to run before Conductor archives a workspace |
| `runScriptMode` | `"concurrent"` \| `"nonconcurrent"` | Controls whether more than one run script can run at the same time |
| `enterpriseDataPrivacy` | `true` \| `false` | Disables features that require external AI providers. See [Privacy](/docs/reference/privacy). |

## Precedence [#precedence]

Scripts configured in Repository Settings on your machine override `conductor.json`.

To use the shared file, clear any personal setup, run, or archive scripts in Repository Settings.

## Related pages [#related-pages]

* [Scripts](/docs/reference/scripts)
* [Share scripts with teammates](/docs/reference/scripts/share-with-teammates)
* [Conductor environment variables](/docs/reference/environment-variables)

## Stack examples [#stack-examples]

These examples are starting points. Adjust the commands for your package manager, environment files, database setup, and dev server.

Conductor works well with NextJS apps. This setup copies `.env.local` and `.vercel` from the repository root into each workspace, then installs dependencies.

```json
{
    "scripts": {
        "setup": "cp $CONDUCTOR_ROOT_PATH/.env.local .env.local && cp -r $CONDUCTOR_ROOT_PATH/.vercel . && pnpm install",
        "run": "pnpm run dev",
        "archive": ""
    }
}
```

Rails apps usually need each workspace to use its own port and share git-ignored local configuration from the repository root.

Start with a `conductor.json` that delegates setup and server startup to scripts in your repository:

```json
{
    "scripts": {
        "setup": "bin/conductor-setup",
        "run": "script/server"
    }
}
```

Create `bin/conductor-setup` to copy or symlink local files into each workspace:

```bash
#!/bin/sh
set -e
cd "$(dirname "$0")/.."

if [ -f "$CONDUCTOR_ROOT_PATH/.env" ]; then
  ln -sf "$CONDUCTOR_ROOT_PATH/.env" .env
fi

if [ -f "$CONDUCTOR_ROOT_PATH/config/database.yml" ]; then
  cp "$CONDUCTOR_ROOT_PATH/config/database.yml" config/database.yml
fi

if [ -f "$CONDUCTOR_ROOT_PATH/config/credentials/development.key" ]; then
  cp "$CONDUCTOR_ROOT_PATH/config/credentials/development.key" config/credentials/development.key
fi

if [ -d "$CONDUCTOR_ROOT_PATH/storage" ]; then
  ln -sf "$CONDUCTOR_ROOT_PATH/storage" storage
fi

script/bootstrap
```

Make it executable:

```bash
chmod +x bin/conductor-setup
```

Create `script/server` to start Rails on `CONDUCTOR_PORT`:

```bash
#!/bin/sh
set -e
cd "$(dirname "$0")/.."

export PORT=${CONDUCTOR_PORT:-${PORT:-3000}}
export VITE_RUBY_PORT=$((PORT + 36))

bundle exec foreman start -p "${PORT}" -f Procfile.dev
```

Make it executable:

```bash
chmod +x script/server
```

Phoenix apps should copy local environment configuration and run the server on `CONDUCTOR_PORT`.

```json
{
    "scripts": {
        "setup": "cp $CONDUCTOR_ROOT_PATH/.env . && mix deps.get && mix ecto.setup",
        "run": "PORT=$CONDUCTOR_PORT mix phx.server",
        "archive": ""
    }
}
```

If you use runtime secrets, copy those too:

```json
{
    "scripts": {
        "setup": "cp $CONDUCTOR_ROOT_PATH/.env . && cp $CONDUCTOR_ROOT_PATH/config/dev.secret.exs config/dev.secret.exs && mix deps.get && mix ecto.setup",
        "run": "PORT=$CONDUCTOR_PORT mix phx.server",
        "archive": ""
    }
}
```

Django apps often need environment variables, dependencies, migrations, and a workspace-specific run command.

```json
{
    "scripts": {
        "setup": "cp $CONDUCTOR_ROOT_PATH/.env . && pip install -r requirements.txt && python manage.py migrate",
        "run": "python manage.py runserver",
        "archive": ""
    }
}
```

If you use a virtual environment, create one per workspace:

```json
{
    "scripts": {
        "setup": "cp $CONDUCTOR_ROOT_PATH/.env . && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt && python manage.py migrate",
        "run": "source venv/bin/activate && python manage.py runserver",
        "archive": ""
    }
}
```

 
