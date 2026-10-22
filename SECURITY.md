# Security and deployment

Cinderline is a static browser game deployed to Firebase Hosting project
`fps-gpt56-one-shot`. The deployment contains no PHP, Node.js server, Cloud
Functions, database or remote game API. Node.js security updates protect the
local build/development tools; production PHP/Node runtime RCE advisories do
not apply to the hosted static files.

Use the patched Node.js version in `.node-version`, install from the lockfile
with `npm ci`, and run `npm audit`, `npm test` and `npm run build` before
deploying with `firebase deploy --only hosting --project fps-gpt56-one-shot`.
The dev and preview servers bind to loopback and should remain local.

Firebase response headers restrict scripts to this origin, prevent framing,
plugins and form submission, set `nosniff`, and disable unused device APIs.
Inline styles remain permitted because the game animates its HUD and injects
its bundled styles. No inline scripts or dynamic code evaluation are allowed.

Saved progression and URL parameters are untrusted input. Progression is
restricted to positive integers; display values use text nodes, and graphics
quality accepts only own keys of the supported preset map. The static HUD
template contains only bundled markup. The opt-in test interface controls the
local game state and has no account, server authority or sensitive data.

An empty dependency audit only covers advisories currently known to the npm
registry; it does not establish the absence of all security defects.
