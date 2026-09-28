# Third-party notices

The [academic research license](LICENSE) applies only to material the RoboSpace Fit rights holders can license. It does not replace or restrict licenses granted by third parties.

## Source included in this repository

- `build/sites-vite-plugin.ts`: vendored from `@openai/sites-vite-plugin` 0.2.0, MIT, Copyright (c) 2026 OpenAI. The complete notice is preserved in [build/sites-vite-plugin.LICENSE](build/sites-vite-plugin.LICENSE).
- `vendor/shadcn-tailwind-4.13.0.css` and upstream portions of the shadcn-based components in `components/ui/`: MIT, Copyright (c) 2023 shadcn. The complete upstream notice is preserved in [vendor/shadcn-tailwind-4.13.0.LICENSE.md](vendor/shadcn-tailwind-4.13.0.LICENSE.md). Original upstream portions retain their MIT permissions.

## Installed packages

JavaScript packages are installed separately with npm and are not bundled in this source repository. Exact dependency versions are recorded in `package-lock.json`. Each dependency retains its own license, copyright, and notice files, including transitive dependencies. Preserve those notices when redistributing a build.

Primary framework and rendering dependencies include [React](https://github.com/facebook/react/blob/main/LICENSE), [Three.js](https://github.com/mrdoob/three.js/blob/dev/LICENSE), and [Vinext](https://github.com/cloudflare/vinext/blob/main/LICENSE), each under MIT. This list is illustrative; the individual installed packages are authoritative for their terms.

## Project assets and manufacturer references

The factory and equipment assets are original synthetic geometry created for this project. Robot visualization geometry is an original approximation informed by publicly available manufacturer references, not a copy of manufacturer CAD. Source links and approximation notes are retained in `lib/robot-data/`, `public/models/robots/*/manifest.json`, and `model-sources/robots/`.

Manufacturer names and product names identify the referenced robots. No endorsement, certification, trademark permission, or rights in manufacturer publications are granted by the project license. Manufacturer photographs, datasheets, and CAD files are not included as downloadable source assets.
