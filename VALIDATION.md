# Research snapshot verification

Verified on 2026-09-28 from a separate copy of the tracked application source, with a fresh dependency installation. Runtime: macOS, Node.js v26.6.0, npm 12.0.2. The declared minimum Node.js version remains 22.13.0; that exact minimum was not separately tested in this release.

| Check | Result |
| --- | --- |
| `npm run install:ci` | Passed; lockfile-based clean installation |
| `npx tsc --noEmit --incremental false` | Passed |
| `npx tsx --test tests/*.test.ts` | 83 tests passed, 0 failed |
| `npm run build` | Passed |
| `npm run dev -- --port 5179` | Started successfully |
| `http://localhost:5179/` | HTTP 200, RoboSpace Fit title present |
| `/models/factory.glb` | HTTP 200, glTF v2, 5,068,952 bytes, declared length matched |

The temporary development server was stopped after verification. Package-install script warnings and large-client-chunk warnings did not prevent the checks from passing. A full browser interaction test and validation against physical robots were not performed for this snapshot release.

Application source and existing assets are byte-for-byte identical to the original version identified in `SNAPSHOT.json`. Release packaging changes are limited to documentation, license/citation metadata, Git binary-asset attributes, npm package identity/version/license metadata, and removal of the internal hosting project association.

These checks verify installation, software consistency, and local serving. They do not establish real-world geometric accuracy, robot safety, cycle-time accuracy, or validity of scientific conclusions. See the analysis limitations in [README.md](README.md).
