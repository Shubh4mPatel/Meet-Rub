# Swagger Documentation Guide for MeetRub Backend

## Setup Complete

The following files have been created/modified:
- Created: `src/config/swagger.js` - Swagger configuration
- Modified: `src/server.js` - Added Swagger UI route
- Modified: `src/routes/authRoutes.js` - Example of documented routes

## Installation

When your network is available, run:
```bash
npm install swagger-jsdoc swagger-ui-express
```

## Accessing Swagger Documentation

Once the packages are installed and server is running, access the Swagger UI at:
```
http://localhost:<PORT>/api-docs
```

For example, if your PORT is 3000:
```
http://localhost:3000/api-docs
```

## How to Document Your Routes

Add JSDoc comments above each route with Swagger annotations. Here's the pattern:

### Basic GET Route Example
```javascript
/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *       404:
 *         description: User not found
 */
router.get('/users/:id', getUser);
```

### POST Route with Request Body
```javascript
/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a new user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               age:
 *                 type: number
 *                 example: 30
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Invalid input
 */
router.post('/users', createUser);
```

### Protected Route (with Authentication)
```javascript
/**
 * @swagger
 * /profile:
 *   get:
 *     summary: Get user profile (requires authentication)
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile data
 *       401:
 *         description: Unauthorized
 */
router.get('/profile', authenticateUser, getProfile);
```

### File Upload Route
```javascript
/**
 * @swagger
 * /upload:
 *   post:
 *     summary: Upload a file
 *     tags: [Files]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: File uploaded successfully
 */
router.post('/upload', upload.single('file'), uploadFile);
```

### Query Parameters Example
```javascript
/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users with pagination
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/users', getUsers);
```

## Reusable Schema Components

You can define reusable schemas in your swagger config or at the top of route files:

```javascript
/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - name
 *         - email
 *       properties:
 *         id:
 *           type: string
 *           description: Auto-generated user ID
 *         name:
 *           type: string
 *           description: User's name
 *         email:
 *           type: string
 *           format: email
 *           description: User's email
 *         createdAt:
 *           type: string
 *           format: date-time
 *       example:
 *         id: abc123
 *         name: John Doe
 *         email: john@example.com
 *         createdAt: 2024-01-01T00:00:00.000Z
 */
```

Then reference it in routes:
```javascript
/**
 * @swagger
 * /users/{id}:
 *   get:
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 */
```

## Next Steps

1. Install the packages when network is available
2. Start your server with `npm run dev`
3. Visit `http://localhost:<PORT>/api-docs`
4. Add Swagger annotations to all your routes in:
   - `src/routes/freelancerRoutes.js`
   - `src/routes/creatorRoutes.js`
   - `src/routes/userProfileRoute.js`
   - `src/routes/adminRoutes.js`

## Tips

- Use **tags** to group related endpoints
- Always include **status codes** in responses (200, 201, 400, 401, 404, 500, etc.)
- Add **examples** to make the API easier to test
- Document **required fields** vs optional fields
- Include **authentication requirements** with `security` section
- Use descriptive **summaries** and **descriptions**

## Common Data Types

- `string` - text
- `number` - any number
- `integer` - whole numbers
- `boolean` - true/false
- `array` - list of items
- `object` - JSON object
- Special formats: `email`, `date`, `date-time`, `password`, `binary`, `uuid`

## Reference

For more advanced usage, see:
- [Swagger OpenAPI 3.0 Specification](https://swagger.io/specification/)
- [swagger-jsdoc Documentation](https://github.com/Surnet/swagger-jsdoc)
