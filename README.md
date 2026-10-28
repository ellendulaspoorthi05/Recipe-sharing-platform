# Gather & Graze: Recipe Sharing Platform

Beginner full-stack example using HTML, CSS, browser JavaScript, Node.js, Express, and Supabase PostgreSQL. The Express server serves the frontend and API. The Supabase secret is read only by the server.

## Folder structure

```text
recipe-sharing-platform/
  public/ (index.html, styles.css, app.js)
  supabase/schema.sql
  .env.example
  .gitignore
  package.json
  server.js
```

## Windows setup, step by step

### Try the page immediately (no Supabase setup)

Open `public/index.html` in a browser. Both **Share a recipe** and **Pull up a chair** work. Demo recipes save in that browser; use the **Delete recipe** button on a recipe card to remove one. Use the full setup below for shared Supabase storage.

1. Install Node.js 20 or later from https://nodejs.org/. Open PowerShell and run `node --version` and `npm --version`.
2. Create a Supabase project at https://supabase.com/.
3. In its SQL Editor, paste and run `supabase/schema.sql`.
4. In Supabase project settings, copy the project URL and server-side service role secret key. Keep the key private.
5. In PowerShell, go to this folder and run `Copy-Item .env.example .env`, then `notepad .env`. Fill the URL and key:

```dotenv
PORT=3000
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-secret-key
```

6. Run `npm install`, then `npm run dev`.
7. Open http://localhost:3000. Keep the terminal running. `Ctrl+C` stops the server; `npm start` runs without file watching.

## What happens

1. `public/index.html` defines the recipe page and submission form.
2. `public/styles.css` styles it for desktop and mobile.
3. `public/app.js` searches, displays, and submits recipes using `fetch()`.
4. `server.js` validates API input and queries Supabase.
5. PostgreSQL stores recipes; SQL constraints repeat important checks.

## API

- `GET /api/recipes` lists the latest recipes. Optional query parameters: `search` and `category`.
- `GET /api/recipes/:id` returns one recipe.
- `POST /api/recipes` validates and stores a recipe.
- `DELETE /api/recipes/:id` deletes a recipe only when the private deletion token from the creating browser is provided.

Example JSON body:

```json
{"title":"Sunday lemon cake","author":"Sam","description":"Bright and soft","category":"Dessert","prep_minutes":55,"servings":8,"image_url":"","ingredients":["2 cups flour","1 lemon"],"instructions":["Heat oven","Mix and bake"]}
```

## Validation and security

The server validates field lengths, category, ingredient and instruction counts, number ranges, and HTTPS image URLs. SQL constraints provide a second check. JSON request size, API traffic, and submissions are limited. The app escapes submitted text before displaying it. `.env` is ignored by Git. Do not put the secret key in browser code, HTML, or a public repository.

Row-level security is enabled, and anonymous/authenticated browser roles have no table grants. The Express server alone uses the secret service role key. Each recipe submission gets a random delete token: the server stores only its SHA-256 hash, and the creating browser saves the token locally. The token is never returned by recipe-list API routes. The **Delete recipe** card button appears for demo recipes or recipes created in that browser. If you already created the database before this update, run the updated `supabase/schema.sql` again to add the token-hash column. This learning demo accepts anonymous submissions and has no sign-in, editing, or moderation. Add Supabase Auth before deploying a public production site.

## Manual check

Start the server, open the page, add a recipe, open its card to view ingredients and steps, then try search/category filters. Try a two-letter title or zero servings; it should be rejected. You can also run `Invoke-RestMethod http://localhost:3000/api/recipes` in PowerShell and inspect rows in Supabase Table Editor.

If setup fails, verify `.env` is beside `server.js`, credentials are correct, and `schema.sql` ran. If port 3000 is busy set `PORT=3001` and open that port.

Official references: [Supabase JS install](https://supabase.com/docs/reference/javascript/installing), [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Express middleware](https://expressjs.com/en/guide/using-middleware/).
