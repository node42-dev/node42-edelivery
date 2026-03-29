# Design Philosophy

### Why **node42-edelivery** is written in plain JavaScript?

A question that comes up: why is a serious, production-grade Peppol AS4 toolkit written in plain JavaScript in 2026?
The answer is not ignorance of TypeScript. It is a deliberate architectural decision based on the nature of this specific domain.

## The hard problems here are not type problems
Peppol AS4 is one of the most complex messaging protocols in enterprise software. A single outbound message involves SML/SMP dynamic discovery, `RSA-OAEP` key wrapping, `AES-128-GCM` payload encryption, `RSA-SHA256` XML signing, `WS-Security` headers, `MIME multipart` encoding, and a strict `SBDH envelope` — all before a single byte hits the wire.

When something goes wrong — and in this domain something always goes wrong during development — the bug is never "you passed a string where a number was expected." The bug is "the receiving Access Point rejects your signature because the canonicalization of the SignedInfo element doesn't match what they expect" or "the SMP record returns an endpoint URL with a trailing slash that breaks your SOAP addressing."

TypeScript would help with structure, but not with protocol correctness — which is where almost all real failures occur in Peppol. The complexity budget in this codebase is entirely consumed by the Peppol protocol itself. Adding type system overhead on top solves none of the actual hard problems and adds friction everywhere.

This does trade compile-time guarantees for runtime transparency — but in this domain, runtime correctness is the dominant concern.

## Source is what runs
This is not a philosophical point. It is a practical one.
In a TypeScript project you write `src/validator.ts`, it compiles to `dist/validator.js`, and that is what Node.js actually executes. When you get a runtime error during an AS4 exchange, the stack trace points into `dist/`. 

Sourcemaps translate it back — if they are configured correctly, if the tooling respects them, if nothing in the build pipeline mangled the output. That is three assumptions under pressure when you are already debugging a crypto failure at 11pm before a go-live.

In this codebase, the file you open is the file that runs. The line in the stack trace is the line in your editor. No translation, no mapping, no gap between what you wrote and what executed. In a domain where a single misplaced byte in an encrypted payload causes silent rejection by a remote Access Point, that directness is not a nicety — it is essential.

In practice, debugging often happens under time pressure, across environments, and sometimes without full control over the toolchain — removing that entire layer reduces failure surface.

## No build step is a feature, not a limitation
`npm install -g @n42/edelivery` and it works. No compilation required, no native addons, no platform-specific binaries. This is a deliberate design constraint that runs through the entire project — it is why all cryptographic operations are implemented using Node's built-in crypto module rather than native bindings, and it is why the source is plain JavaScript rather than TypeScript.

For a CLI tool that integration developers, ERP vendors, and Peppol consultants need to install quickly across Linux, macOS, and Windows in enterprise environments — zero toolchain friction is a hard requirement, not a nice-to-have.

## Every Node.js developer can contribute immediately
The people who work with Peppol are integration developers, enterprise backend engineers, and people building ERP connectors. They know JavaScript — and while most know TypeScript, keeping the source in plain JavaScript means anyone can clone the repo, read the code and submit a fix without needing to context-switch into type system mechanics. The barrier to contribution is intentionally as low as possible.

## Precedent
This is the same approach taken by Express.js, nodemailer, dotenv, Lodash, and much of the foundational Node.js ecosystem — not because TypeScript did not exist, but because plain JavaScript is the right tool for libraries and tools where simplicity, portability, and zero build friction are first-class requirements.
The difference is that those projects often stayed JavaScript by inertia. This one chose it deliberately.

**The goal of this project is to make Peppol AS4 accessible in Node.js with the absolute minimum of friction. Every decision — zero native dependencies, zero compilation, plain JavaScript — serves that goal.**