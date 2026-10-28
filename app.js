const grid = document.querySelector('#recipes');
const status = document.querySelector('#status');
const dialog = document.querySelector('#form-dialog');
const form = document.querySelector('#recipe-form');
let timer;
let offline = false;

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const localRecipes = () => JSON.parse(localStorage.getItem('gather-recipes') || '[]');
const deleteTokens = () => JSON.parse(localStorage.getItem('gather-recipe-delete-tokens') || '{}');
function newDeleteToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function load() {
  const search = document.querySelector('#search').value.toLowerCase();
  const category = document.querySelector('#category').value;
  try {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (category) params.set('category', category);
    const response = await fetch('/api/recipes?' + params);
    const result = await response.json();
    if (!response.ok) throw Error(result.error || 'Could not load recipes.');
    offline = false;
    show(result.recipes);
  } catch {
    offline = true;
    show(localRecipes().filter((recipe) =>
      (!search || `${recipe.title} ${recipe.description}`.toLowerCase().includes(search)) &&
      (!category || recipe.category === category)
    ));
  }
}

function show(recipes) {
  const tokens = deleteTokens();
  status.textContent = offline
    ? 'Demo mode · recipes are saved only in this browser'
    : `${recipes.length} recipe${recipes.length === 1 ? '' : 's'} to inspire you`;
  if (!recipes.length) {
    grid.innerHTML = '<p class="empty">No recipes yet. Click “Share a recipe” to add the first one!</p>';
    return;
  }
  grid.innerHTML = recipes.map((recipe) => `<article class="card" data-id="${esc(recipe.id)}">
    <img loading="lazy" src="${esc(recipe.image_url || 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80')}" alt="${esc(recipe.title)}">
    <span class="tag">${esc(recipe.category)} · ${Number(recipe.prep_minutes)} min</span>
    <h3>${esc(recipe.title)}</h3><p>${esc(recipe.description || 'Made for sharing.')}<br>By ${esc(recipe.author)}</p>
    ${offline || tokens[recipe.id] ? '<button class="delete-recipe card-delete" type="button">Delete recipe</button>' : ''}</article>`).join('');
  grid.querySelectorAll('.card').forEach((card) => {
    card.onclick = () => openDetails(card.dataset.id, recipes);
  });
  grid.querySelectorAll('.card-delete').forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      removeRecipe(button.closest('.card').dataset.id, recipes);
    };
  });
}

async function removeRecipe(id, recipes) {
  const recipe = recipes.find((item) => item.id === id);
  if (!recipe || !confirm(`Delete “${recipe.title}”? This cannot be undone.`)) return;
  const tokens = deleteTokens();
  try {
    if (offline) {
      localStorage.setItem('gather-recipes', JSON.stringify(localRecipes().filter((item) => item.id !== id)));
    } else {
      const response = await fetch(`/api/recipes/${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { 'x-recipe-delete-token': tokens[id] }
      });
      if (!response.ok) {
        const result = await response.json();
        throw Error(result.error || 'Could not delete recipe.');
      }
      delete tokens[id];
      localStorage.setItem('gather-recipe-delete-tokens', JSON.stringify(tokens));
    }
    document.querySelector('.card-detail')?.remove();
    await load();
  } catch (error) {
    alert(error.message);
  }
}

function openDetails(id, recipes) {
  const recipe = recipes.find((item) => item.id === id);
  const tokens = deleteTokens();
  const canDelete = offline || Boolean(tokens[recipe.id]);
  const overlay = document.createElement('div');
  overlay.className = 'card-detail';
  overlay.innerHTML = `<div class="detail"><button class="close" aria-label="Close">×</button>
    <img src="${esc(recipe.image_url || 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=800&q=80')}" alt="${esc(recipe.title)}">
    <p class="tag">${esc(recipe.category)} · ${Number(recipe.prep_minutes)} min · Serves ${Number(recipe.servings)}</p>
    <h2>${esc(recipe.title)}</h2><p>${esc(recipe.description)}</p><h3>Ingredients</h3>
    <ul>${recipe.ingredients.map((item) => `<li>${esc(item)}</li>`).join('')}</ul><h3>Steps</h3>
    <ol>${recipe.instructions.map((item) => `<li>${esc(item)}</li>`).join('')}</ol>
    <p>Shared by ${esc(recipe.author)}</p>
    ${canDelete ? '<button class="delete-recipe" type="button">Delete this recipe</button>' : ''}</div>`;
  overlay.onclick = (event) => {
    if (event.target === overlay || event.target.className === 'close') overlay.remove();
  };
  const deleteButton = overlay.querySelector('.delete-recipe');
  if (deleteButton) deleteButton.onclick = () => removeRecipe(recipe.id, recipes);
  document.body.append(overlay);
}

document.querySelector('#open').onclick = () => dialog.showModal();
document.querySelector('#browse').onclick = () => document.querySelector('#recipes').scrollIntoView({ behavior: 'smooth' });
document.querySelector('#close').onclick = () => dialog.close();
dialog.onclick = (event) => { if (event.target === dialog) dialog.close(); };
document.querySelector('#search').oninput = () => { clearTimeout(timer); timer = setTimeout(load, 250); };
document.querySelector('#category').onchange = load;

form.onsubmit = async (event) => {
  event.preventDefault();
  const error = document.querySelector('#error');
  const button = form.querySelector('[type=submit]');
  error.textContent = '';
  const recipe = Object.fromEntries(new FormData(form));
  recipe.prep_minutes = Number(recipe.prep_minutes);
  recipe.servings = Number(recipe.servings);
  recipe.ingredients = recipe.ingredients.split('\n').map((line) => line.trim()).filter(Boolean);
  recipe.instructions = recipe.instructions.split('\n').map((line) => line.trim()).filter(Boolean);
  recipe.delete_token = newDeleteToken();
  button.disabled = true;
  try {
    if (!offline) {
      const response = await fetch('/api/recipes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(recipe)
      });
      const result = await response.json();
      if (response.ok) {
        const tokens = deleteTokens();
        tokens[result.recipe.id] = recipe.delete_token;
        localStorage.setItem('gather-recipe-delete-tokens', JSON.stringify(tokens));
        form.reset(); dialog.close(); await load();
        document.querySelector('#discover').scrollIntoView({ behavior: 'smooth' });
        return;
      }
      if (response.status === 400) throw Error(Object.values(result.fields || {}).join(' ') || result.error);
      throw Error(result.error || 'Could not save recipe.');
    }
    recipe.id = crypto.randomUUID();
    recipe.created_at = new Date().toISOString();
    localStorage.setItem('gather-recipes', JSON.stringify([recipe, ...localRecipes()]));
    form.reset(); dialog.close(); await load();
    document.querySelector('#discover').scrollIntoView({ behavior: 'smooth' });
  } catch (submitError) {
    error.textContent = submitError.message === 'Failed to fetch'
      ? 'Could not reach the server. Please try again.' : submitError.message;
  } finally {
    button.disabled = false;
  }
};

load();
