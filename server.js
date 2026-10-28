import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, timingSafeEqual } from 'node:crypto';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
});
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], styleSrc: ["'self'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'],
  imgSrc: ["'self'", 'data:', 'https:'], scriptSrc: ["'self'"], connectSrc: ["'self'"]
} } }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });
app.use('/api', apiLimiter);

function cleanText(value) { return typeof value === 'string' ? value.trim() : ''; }
const hashDeleteToken = (token) => createHash('sha256').update(token).digest('hex');
function validateRecipe(body) {
  const errors = {};
  const title = cleanText(body?.title);
  const author = cleanText(body?.author);
  const description = cleanText(body?.description);
  const ingredients = Array.isArray(body?.ingredients) ? body.ingredients.map(cleanText).filter(Boolean) : [];
  const instructions = Array.isArray(body?.instructions) ? body.instructions.map(cleanText).filter(Boolean) : [];
  const category = cleanText(body?.category);
  const imageUrl = cleanText(body?.image_url);
  const minutes = Number(body?.prep_minutes);
  const servings = Number(body?.servings);
  const categories = ['Breakfast', 'Lunch', 'Dinner', 'Dessert', 'Snack'];
  if (title.length < 3 || title.length > 100) errors.title = 'Title must be 3–100 characters.';
  if (author.length < 2 || author.length > 60) errors.author = 'Name must be 2–60 characters.';
  if (description.length > 500) errors.description = 'Description must be 500 characters or fewer.';
  if (ingredients.length < 1 || ingredients.length > 30 || ingredients.some((x) => x.length > 120)) errors.ingredients = 'Add 1–30 ingredients, each 120 characters or fewer.';
  if (instructions.length < 1 || instructions.length > 20 || instructions.some((x) => x.length > 1000)) errors.instructions = 'Add 1–20 steps, each 1,000 characters or fewer.';
  if (!categories.includes(category)) errors.category = 'Choose a category from the list.';
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) errors.prep_minutes = 'Time must be 1–1,440 minutes.';
  if (!Number.isInteger(servings) || servings < 1 || servings > 100) errors.servings = 'Servings must be 1–100.';
  if (imageUrl && (!/^https:\/\//i.test(imageUrl) || imageUrl.length > 500)) errors.image_url = 'Image URL must begin with https:// and be under 500 characters.';
  return { errors, recipe: { title, author, description, ingredients, instructions, category, prep_minutes: minutes, servings, image_url: imageUrl || null } };
}

app.get('/api/recipes', async (req, res, next) => {
  try {
    const search = cleanText(req.query.search).slice(0, 80);
    const category = cleanText(req.query.category);
    let query = supabase.from('recipes').select('id,title,author,description,ingredients,instructions,category,prep_minutes,servings,image_url,created_at').order('created_at', { ascending: false }).limit(60);
    if (search) query = query.or(`title.ilike.%${search.replace(/[,.()]/g, ' ')}%,description.ilike.%${search.replace(/[,.()]/g, ' ')}%`);
    if (['Breakfast','Lunch','Dinner','Dessert','Snack'].includes(category)) query = query.eq('category', category);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ recipes: data });
  } catch (error) { next(error); }
});

app.get('/api/recipes/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('recipes').select('id,title,author,description,ingredients,instructions,category,prep_minutes,servings,image_url,created_at').eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Recipe not found.' });
    res.json({ recipe: data });
  } catch (error) { next(error); }
});

app.post('/api/recipes', writeLimiter, async (req, res, next) => {
  try {
    const { errors, recipe } = validateRecipe(req.body);
    const deleteToken = cleanText(req.body?.delete_token);
    if (!/^[a-f0-9]{64}$/i.test(deleteToken)) errors.delete_token = 'Please refresh the page and try again.';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Please check the form fields.', fields: errors });
    const { data, error } = await supabase.from('recipes').insert({ ...recipe, delete_token_hash: hashDeleteToken(deleteToken) }).select('id,title,author,description,ingredients,instructions,category,prep_minutes,servings,image_url,created_at').single();
    if (error) throw error;
    res.status(201).json({ recipe: data });
  } catch (error) { next(error); }
});

app.delete('/api/recipes/:id', writeLimiter, async (req, res, next) => {
  try {
    const token = cleanText(req.get('x-recipe-delete-token'));
    if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(403).json({ error: 'Only the browser that created this recipe can delete it.' });
    const { data: existing, error: readError } = await supabase.from('recipes').select('delete_token_hash').eq('id', req.params.id).maybeSingle();
    if (readError) throw readError;
    if (!existing) return res.status(404).json({ error: 'Recipe not found.' });
    const actual = Buffer.from(hashDeleteToken(token), 'hex');
    const expected = Buffer.from(existing.delete_token_hash || '', 'hex');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(403).json({ error: 'Only the browser that created this recipe can delete it.' });
    const { error } = await supabase.from('recipes').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (error) { next(error); }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((error, req, res, next) => {
  console.error('Request failed:', error.message);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Recipe platform is running at http://localhost:${port}`));
