export const docsNavigation = [
  {
    slug: '',
    title: 'Documentation',
    description: 'Find your way around the plugin and its guides.',
  },
  {
    slug: 'getting-started',
    title: 'Getting started',
    description:
      'Requirements, installation, updates, and device compatibility.',
  },
  {
    slug: 'usage',
    title: 'Using your controls',
    description: 'Buttons, pages, folders, dials, displays, and state icons.',
  },
  {
    slug: 'action-packs',
    title: 'Action packs',
    description: 'Add custom commands, icons, and action states.',
  },
  {
    slug: 'troubleshooting',
    title: 'Troubleshooting',
    description: 'Resolve setup, USB, runtime, and network-light issues.',
  },
  {
    slug: 'development',
    title: 'Plugin development',
    description: 'Build, test, install locally, and validate the plugin.',
  },
];

export const docsPath = (slug = '') =>
  `${import.meta.env.BASE_URL}docs/${slug ? `${slug}/` : ''}`;
