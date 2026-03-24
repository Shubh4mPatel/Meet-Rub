// uploadConfigs.js  ─────────────────────────────────────────────────────────
// Central place to define every upload type your app supports.
// Each slot has its own mime types, size cap, and storage path prefix.

const MB = 1024 * 1024;

const UPLOAD_CONFIGS = {
  service_images: {
    slots: [
      {
        name: 'gallery_1',          // required cover photo
        required: true,
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxSizeBytes: 5 * MB,
        keyPrefix: 'services/gallery',
      },
      {
        name: 'gallery_2',          // optional gallery photos
        required: true,
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxSizeBytes: 5 * MB,
        keyPrefix: 'services/gallery',
      },
      {
        name: 'gallery_3',
        required: true,
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxSizeBytes: 5 * MB,
        keyPrefix: 'services/gallery',
      },
    ],
  },

  profile_assets: {
    slots: [
      {
        name: 'avatar',
        required: true,
        allowedTypes: ['image/jpeg', 'image/png'],
        maxSizeBytes: 2 * MB,
        keyPrefix: 'profiles/avatars',
      },
      {
        name: 'cover_photo',
        required: false,             // optional slot still gets a URL generated
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxSizeBytes: 8 * MB,
        keyPrefix: 'profiles/covers',
      },
    ],
  },

  document_upload: {
    slots: [
      {
        name: 'main_doc',
        required: true,
        allowedTypes: ['application/pdf'],
        maxSizeBytes: 50 * MB,
        keyPrefix: 'documents',
      },
    ],
  },

  deliverable_file: {
    slots: [
      {
        name: 'file',
        required: true,
        allowedTypes: [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
          'video/mp4',
          'video/webm',
          'application/zip',
          'application/x-zip-compressed',
        ],
        maxSizeBytes: 100 * MB,
        keyPrefix: 'deliverables',
      },
    ],
  },
};

module.exports = { UPLOAD_CONFIGS };