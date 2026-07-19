const { query } = require('../../../config/dbConfig');
const AppError = require('../../../utils/appError');
const { logger } = require('../../../utils/logger');
const { minioClient } = require('../../../config/minio');
const { createPresignedUrl } = require('../../../utils/helper');
const crypto = require('crypto');
const path = require('path');

const BUCKET_NAME = 'meet-rub-assets';
const EXPIRY_SECONDS = 4 * 60 * 60; // 4 hours

// Default home page content — mirrors the hard-coded values on the public page
// so the sections still render before an admin customizes anything. Image
// fields are left empty; the public page falls back to its bundled images.
const DEFAULT_CONTENT = {
  howItWorks: {
    label: 'How it works',
    title: 'Get work done in just a',
    titleHighlight: 'few simple steps.',
    creatorLabel: 'Creator',
    freelancerLabel: 'Freelancer',
    buttonText: 'Get Started',
    creatorSteps: [
      { title: 'Post Your Requirement', description: 'Share your project requirements' },
      { title: 'Get Matched with Experts', description: 'Connect with skilled professionals' },
      { title: 'Collaborate & Execute', description: 'Work together and review' },
      { title: 'Receive & Scale', description: 'Receive work and grow' },
    ],
    freelancerSteps: [
      { title: 'Create Your Profile', description: 'Showcase skills and experience' },
      { title: 'List Your Services', description: 'Create packages and pricing' },
      { title: 'Get Client Orders', description: 'Receive projects from creators' },
      { title: 'Deliver & Grow', description: 'Turn projects into growth' },
    ],
  },
  madeWith: {
    label: 'Made with meetrub',
    title: 'Turn your creator skills into income.',
    subtitle: 'Are you an editor, strategist, designer or creator specialist? Join Meetrub and work with creators actively looking for talent.',
    buttonText: 'Become a Creator Specialist',
    cards: [
      { image: '', featured: 'Sanjay Nuthra', edited: 'Yash' },
      { image: '', featured: 'Sanjay Nuthra', edited: 'Yash' },
      { image: '', featured: 'Richa Jindal', edited: 'Aman' },
      { image: '', featured: 'Sanjay Nuthra', edited: 'Yash' },
      { image: '', featured: 'Saurabh Bhatnagar', edited: 'Aman' },
      { image: '', featured: 'Sanjay Nuthra', edited: 'Yash' },
    ],
  },
  testimonials: {
    label: 'Testimonials',
    title: 'Building with creators.',
    titleHighlight: 'Creators are already',
    items: [
      { name: 'Priya Mehta', designation: 'Personal Brand Consultant', image: '', description: 'Within a few weeks, I found experts for editing, graphic design, and content strategy. It saved me countless hours and helped me scale my content production.' },
      { name: 'Rajesh Verma', designation: 'Business Coach', image: '', description: 'Finding reliable content creators used to be a challenge. Through Meetrub, I found a professional video editor who completely transformed my content quality.' },
      { name: 'Simran Kaur', designation: 'YouTube Creator', image: '', description: 'The quality of freelancers on the platform exceeded my expectations. Communication was easy and delivery was on time.' },
      { name: 'Rohit Bansal', designation: 'Freelance Video Editor', image: '', description: 'As a freelancer, the platform helped me connect with serious clients who value quality work.' },
    ],
  },
  cta: {
    title: 'Random freelancers.',
    titleHighlight: 'Stop hiring',
    description: 'Hire creator specialists who understand growth.',
    buttonText: 'Get Started',
    topLabel: 'You video is ready to post',
    bottomLabel: 'Find Creative Experts',
    image: '',
    topUserImage: '',
    bottomUserImage: '',
  },
  faq: {
    label: "FAQ's",
    title: 'Solved.',
    titleHighlight: 'Your Curiosity,',
    items: [
      { question: 'What is Meetrub ?', answer: 'Meetrub is a marketplace that connects creators, business owners, coaches, consultants, and brands with skilled freelancers offering content creation and digital marketing services.' },
      { question: 'What types of services are available on the platform?', answer: 'You can find services such as video editing, thumbnail design, script writing, AI voiceovers, podcast editing, social media management, YouTube channel management, content strategy, and more.' },
      { question: 'How do payments work?', answer: 'Payments are processed securely through the platform. Funds are released after the project is completed and approved according to the agreed terms.' },
      { question: 'How can I become a freelancer on Meetrub?', answer: 'Simply create a profile, showcase your portfolio, list your services, and start receiving project opportunities from clients looking for your expertise.' },
      { question: "What if I'm not satisfied with the delivered work?", answer: 'Meetrub encourages clear communication between clients and freelancers. Revision policies and project requirements are agreed upon before work begins.' },
    ],
  },
};

// Ensure the single-row storage table exists.
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS home_page_content (
      id INT PRIMARY KEY DEFAULT 1,
      content JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      CONSTRAINT home_page_content_single_row CHECK (id = 1)
    )
  `);
}

// ── Image field helpers ───────────────────────────────────────────────────────
// The only image-bearing fields, so we know exactly what to presign / normalize.
function forEachImageField(content, fn) {
  if (!content || typeof content !== 'object') return;
  (content.madeWith?.cards || []).forEach((card) => { if (card) card.image = fn(card.image); });
  (content.testimonials?.items || []).forEach((item) => { if (item) item.image = fn(item.image); });
  if (content.cta) {
    content.cta.image = fn(content.cta.image);
    content.cta.topUserImage = fn(content.cta.topUserImage);
    content.cta.bottomUserImage = fn(content.cta.bottomUserImage);
  }
}

// Convert a stored object path (bucket/object) into a presigned GET URL for display.
async function presignPath(storedPath) {
  if (!storedPath || /^https?:\/\//i.test(storedPath)) return storedPath || '';
  try {
    const parts = storedPath.split('/');
    const bucket = parts[0];
    const objectName = parts.slice(1).join('/');
    return await createPresignedUrl(bucket, objectName, EXPIRY_SECONDS);
  } catch {
    return '';
  }
}

// Presign every image field for display (returns a fresh content object).
async function presignImages(content) {
  const clone = JSON.parse(JSON.stringify(content));
  const jobs = [];
  forEachImageField(clone, (val) => {
    const p = presignPath(val);
    jobs.push(p);
    return p; // placeholder promise, resolved below
  });
  const resolved = await Promise.all(jobs);
  let i = 0;
  forEachImageField(clone, () => resolved[i++]);
  return clone;
}

// Turn any presigned URL back into its stored object path before saving.
function toObjectPath(val) {
  if (!val) return '';
  if (!/^https?:\/\//i.test(val)) return val; // already a path
  try {
    return new URL(val).pathname.replace(/^\/+/, '');
  } catch {
    return '';
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// GET /public/home-content — read content (seed defaults on first call).
const getHomeContent = async (req, res, next) => {
  try {
    await ensureTable();
    let { rows } = await query('SELECT content FROM home_page_content WHERE id = 1');
    if (rows.length === 0) {
      await query(
        'INSERT INTO home_page_content (id, content) VALUES (1, $1) ON CONFLICT (id) DO NOTHING',
        [DEFAULT_CONTENT]
      );
      rows = [{ content: DEFAULT_CONTENT }];
    }
    const content = await presignImages(rows[0].content);
    return res.status(200).json({ status: 'success', data: content });
  } catch (error) {
    logger.error('Failed to fetch home content:', error);
    return next(new AppError('Failed to fetch home content', 500));
  }
};

// PUT /admin/home-content — save the full content JSON (admin).
const updateHomeContent = async (req, res, next) => {
  try {
    await ensureTable();
    const content = req.body?.content ?? req.body;
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
      return next(new AppError('A content object is required', 400));
    }

    // Store object paths, never presigned URLs (which expire).
    forEachImageField(content, toObjectPath);

    await query(
      `INSERT INTO home_page_content (id, content, updated_at)
       VALUES (1, $1, NOW())
       ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()`,
      [content]
    );

    const saved = await presignImages(content);
    return res.status(200).json({ status: 'success', message: 'Home content updated', data: saved });
  } catch (error) {
    logger.error('Failed to update home content:', error);
    return next(new AppError('Failed to update home content', 500));
  }
};

// POST /admin/home-content/upload-image — upload one image, return its path + preview URL.
const uploadHomeImage = async (req, res, next) => {
  try {
    const file = Array.isArray(req.files) ? req.files[0] : req.file;
    if (!file) return next(new AppError('An image file is required', 400));
    if (!file.mimetype?.startsWith('image/')) {
      return next(new AppError('Only image files are allowed', 400));
    }

    const ext = path.extname(file.originalname) || '.jpg';
    const objectName = `home-content/${Date.now()}-${crypto.randomUUID()}${ext}`;
    await minioClient.putObject(BUCKET_NAME, objectName, file.buffer, file.size, { 'Content-Type': file.mimetype });

    const objectPath = `${BUCKET_NAME}/${objectName}`;
    const url = await createPresignedUrl(BUCKET_NAME, objectName, EXPIRY_SECONDS);
    return res.status(200).json({ status: 'success', data: { objectPath, url } });
  } catch (error) {
    logger.error('Failed to upload home image:', error);
    return next(new AppError('Failed to upload image', 500));
  }
};

module.exports = { getHomeContent, updateHomeContent, uploadHomeImage };
