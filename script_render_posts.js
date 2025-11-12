// ====== Michel Blog Script ======
// Goals: minimal JS to render posts (featured + grid), simple nav toggle,
// and a placeholder 'newsletter' handler. No dependencies.
//
// Data source: posts.json (static). In production, back it with a CMS.
// Each function is small, commented, and deterministic.

// Utility: qs/qsa
const qs = (sel, el=document) => el.querySelector(sel);
const qsa = (sel, el=document) => [...el.querySelectorAll(sel)];

// Wire up common UI on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  // Mobile nav
  const toggle = qs('.nav-toggle');
  const list = qs('.nav-links');
  if (toggle && list){
    toggle.addEventListener('click', () => {
      const open = list.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  // Year in footer
  const year = qs('#year');
  if (year){ year.textContent = String(new Date().getFullYear()); }

  // Page-specific boot
  const page = qs('main')?.dataset?.page;
  if (page === 'home'){ bootHome(); }
  if (page === 'blog'){ bootBlog(); }
  if (page === 'post'){ bootPost(); }

  // Newsletter demo (no network; simply acknowledge)
  const form = qs('#newsletter-form');
  if (form){
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = qs('#email')?.value?.trim();
      if(!email){ alert('Please enter an email.'); return; }
      alert('Thanks! (Demo only — connect a real provider later.)');
      form.reset();
    });
  }
});

// Load posts.json (works when served over HTTP; file:// disallows fetch in some browsers)
async function loadPosts(){
    const res = await fetch('posts.json', {cache:'no-store'});
    if (!res.ok) { throw new Error('Failed to load posts.json'); }
  const posts = await res.json();
  // Sort newest first by date (ISO YYYY-MM-DD)
  posts.sort((a,b) => (a.date < b.date ? 1 : -1));
  return posts;
}

// HOME: featured + recent
async function bootHome(){
  try{
    const posts = await loadPosts();
    const featured = posts.find(p => p.featured) || posts[0];
    renderFeature(qs('#featured-article'), featured);
    renderGrid(qs('#recent-grid'), posts.filter(p => p.id !== featured.id).slice(0,6));
  }catch(err){
    console.error(err);
  }
}

// BLOG: featured + full grid
async function bootBlog(){
  try{
    const posts = await loadPosts();
    const featured = posts.find(p => p.featured) || posts[0];
    renderFeature(qs('#blog-featured'), featured);
    renderGrid(qs('#posts-grid'), posts.filter(p => p.id !== featured.id));
  }catch(err){
    console.error(err);
  }
}

// POST: single article from ?id=
async function bootPost(){
  try{
    const url = new URL(location.href);
    const id = url.searchParams.get('id');
    const posts = await loadPosts();
    const p = posts.find(x => String(x.id) === String(id));
    const mount = qs('#post');
    if(!p){ mount.innerHTML = '<p>Post not found.</p>'; return; }
    mount.innerHTML = articleHTML(p, true);
    document.title = p.title + ' — Michel';
  }catch(err){
    console.error(err);
  }
}

// Render helpers
function renderFeature(el, post){
  if(!el || !post) return;
  el.innerHTML = `
    <img src="${post.cover || 'assets/cover.jpg'}" alt="" loading="lazy">
    <div>
      <a class="meta" href="post.html?id=${post.id}">${escapeHTML(post.category || 'Essay')}</a>
      <h3><a href="post.html?id=${post.id}">${escapeHTML(post.title)}</a></h3>
      <p class="meta">${escapeHTML(post.date)} • ${escapeHTML(post.readingTime || '5 min')}</p>
      <p>${escapeHTML(post.excerpt)}</p>
    </div>
  `;
}

function renderGrid(el, posts){
  if(!el) return;
  el.innerHTML = posts.map(cardHTML).join('');
}

function cardHTML(p){
  return `
  <article class="card">
    <a href="post.html?id=${p.id}">
      <img src="${p.cover || 'assets/cover.jpg'}" alt="" loading="lazy" style="width:100%;border-radius:8px;border:1px solid var(--border)">
      <h3>${escapeHTML(p.title)}</h3>
      <p class="meta">${escapeHTML(p.date)} • ${escapeHTML(p.readingTime || '5 min')}</p>
      <p>${escapeHTML(p.excerpt)}</p>
    </a>
  </article>`;
}

function articleHTML(p, full=false){
  return `
    <header class="prose">
      <p class="meta">${escapeHTML(p.date)} • ${escapeHTML(p.readingTime || '5 min')} • ${escapeHTML(p.category || 'Essay')}</p>
      <h1>${escapeHTML(p.title)}</h1>
      ${p.cover ? `<img src="${p.cover}" alt="">` : ''}
      <p class="meta">By Michel</p>
    </header>
    <div class="prose">
      ${full ? p.html || `<p>${escapeHTML(p.excerpt)}</p>` : `<p>${escapeHTML(p.excerpt)}</p>`}
    </div>
  `;
}

// Tiny HTML escaper for safety
function escapeHTML(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
