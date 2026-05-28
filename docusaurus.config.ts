import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'edgelight',
  tagline: 'edgedb meets sqlite',
  favicon: 'img/logo.svg',

  url: 'https://joeblackwaslike.github.io',
  baseUrl: '/edgelight/',
  organizationName: 'joeblackwaslike',
  projectName: 'edgelight',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [
    [
      'docusaurus-plugin-typedoc',
      {
        entryPoints: ['./src/index.ts'],
        tsconfig: './tsconfig.json',
        out: 'api',
        sidebar: {
          categoryLabel: 'API Reference',
        },
      },
    ],
    [
      'docusaurus-plugin-llms',
      {
        generateLLMsTxt: true,
        generateMarkdownFiles: true,
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/joeblackwaslike/edgelight/edit/main/',
          routeBasePath: '/',
        },
        blog: false,
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'edgelight',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'mainSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/joeblackwaslike/edgelight',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      copyright: `Copyright © 2026 Joe Black. Built with <a href="https://docusaurus.io">Docusaurus</a>.`,
    },
    colorMode: {
      defaultMode: 'light',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    // Algolia DocSearch — apply at https://docsearch.algolia.com/apply/
    // algolia: {
    //   appId: 'YOUR_APP_ID',
    //   apiKey: 'YOUR_SEARCH_API_KEY',
    //   indexName: 'edgelight',
    // },
  } satisfies Preset.ThemeConfig,
};

export default config;
