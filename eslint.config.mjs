import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist', '**/out-tsc', '**/target', '**/.angular'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            // Legacy `scope:*` axis. `scope:app` is allowed to reach new
            // app-scoped domain libs (tagged `app:desktop`) so the
            // transition from one-flat-app to per-domain libs is a
            // strictly-additive operation.
            {
              sourceTag: 'scope:app',
              onlyDependOnLibsWithTags: [
                'scope:app',
                'scope:mozart-ui',
                'scope:spartan',
                'scope:shared',
                'app:desktop',
              ],
            },
            {
              sourceTag: 'scope:mozart-ui',
              onlyDependOnLibsWithTags: [
                'scope:mozart-ui',
                'scope:spartan',
                'scope:shared',
              ],
            },
            {
              sourceTag: 'scope:spartan',
              onlyDependOnLibsWithTags: ['scope:spartan', 'scope:shared'],
            },
            {
              sourceTag: 'scope:shared',
              onlyDependOnLibsWithTags: ['scope:shared'],
            },
            // New `app:<name>` axis. App-scoped libs (e.g. desktop
            // domain libs) can pull in shared building blocks plus
            // other libs in the same app — never another app's libs.
            {
              sourceTag: 'app:desktop',
              onlyDependOnLibsWithTags: [
                'app:desktop',
                'scope:mozart-ui',
                'scope:spartan',
                'scope:shared',
              ],
            },
            // Layer axis. Mirrors the Nx-Angular-Architects model:
            //   feature → feature | ui | data-access | util
            //   ui      → ui | util
            //   data-access → data-access | util
            //   util    → util
            // Plus a passthrough for the legacy scope:* tree so libs in
            // any layer can keep consuming shared Hlm / Spartan / util
            // libraries that aren't yet on the layer axis.
            {
              sourceTag: 'type:feature',
              onlyDependOnLibsWithTags: [
                'type:feature',
                'type:ui',
                'type:data-access',
                'type:util',
                'scope:mozart-ui',
                'scope:spartan',
                'scope:shared',
              ],
            },
            {
              sourceTag: 'type:ui',
              onlyDependOnLibsWithTags: [
                'type:ui',
                'type:util',
                'scope:mozart-ui',
                'scope:spartan',
                'scope:shared',
              ],
            },
            {
              sourceTag: 'type:data-access',
              onlyDependOnLibsWithTags: [
                'type:data-access',
                'type:util',
                'scope:shared',
              ],
            },
            {
              sourceTag: 'type:util',
              onlyDependOnLibsWithTags: ['type:util', 'scope:shared'],
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.cts',
      '**/*.mts',
      '**/*.js',
      '**/*.jsx',
      '**/*.cjs',
      '**/*.mjs',
    ],
    // Override or add rules here
    rules: {},
  },
];
